"""
services/storage.py — All file I/O for the v2 backend.

Consolidates CSV bar loading, model artifact save/load, and the data
pipeline (clean, feature-engineer, scale, window, gap-filter).
All paths are rooted under backend/downloads/ and backend/models/.
"""

from __future__ import annotations

import json
import os
import shutil
from datetime import datetime
from typing import Any

import joblib
import numpy as np
import pandas as pd
import torch
from sklearn.preprocessing import RobustScaler

from services import config_manager


# ── CSV bars ──────────────────────────────────────────────────────────────────

def csv_path(symbol: str, timeframe: str) -> str:
    return os.path.join(config_manager.downloads_dir(), symbol, f"{timeframe}.csv")


def save_bars_to_csv(symbol: str, timeframe: str, bars: list[dict]) -> str:
    """Write raw Alpaca bar dicts to {downloads_dir}/{symbol}/{timeframe}.csv."""
    df = pd.DataFrame(bars)
    df.rename(columns={
        "t": "timestamp", "o": "open", "h": "high",
        "l": "low", "c": "close", "v": "volume",
        "vw": "vwap", "n": "trade_count",
    }, inplace=True)
    out = csv_path(symbol, timeframe)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    df.to_csv(out, index=False)
    return out


def load_bars(symbol: str, timeframe: str, max_bars: int | None = None) -> pd.DataFrame:
    """Load OHLCV CSV and return a chronologically sorted DataFrame."""
    path = csv_path(symbol, timeframe)
    df = pd.read_csv(path, parse_dates=["timestamp"], nrows=max_bars)
    df = df.sort_values("timestamp").reset_index(drop=True)
    if df["timestamp"].dt.tz is not None:
        df["timestamp"] = df["timestamp"].dt.tz_convert(None)
    return df


# ── Data pipeline ─────────────────────────────────────────────────────────────

def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.drop_duplicates(subset=["timestamp"])
    df = df.dropna().reset_index(drop=True)
    return df


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    # ── Trend ────────────────────────────────────────────────────────────────
    df["ema_9"]  = df["close"].ewm(span=9,  adjust=False).mean()
    df["ema_21"] = df["close"].ewm(span=21, adjust=False).mean()
    df["ema_50"] = df["close"].ewm(span=50, adjust=False).mean()

    # ── MACD ─────────────────────────────────────────────────────────────────
    ema_12          = df["close"].ewm(span=12, adjust=False).mean()
    ema_26          = df["close"].ewm(span=26, adjust=False).mean()
    df["macd"]      = ema_12 - ema_26
    df["macd_9"]    = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_hist"] = df["macd"] - df["macd_9"]

    # ── Candle structure ─────────────────────────────────────────────────────
    df["body"]       = df["close"] - df["open"]
    df["upper_wick"] = df["high"] - df[["open", "close"]].max(axis=1)
    df["lower_wick"] = df[["open", "close"]].min(axis=1) - df["low"]
    df["candle_efficiency"] = (
        df["body"].abs()
        / (df["upper_wick"] + df["lower_wick"] + df["body"].abs() + 1e-9)
    )

    # ── Returns & volume ─────────────────────────────────────────────────────
    df["return"]       = df["close"].pct_change()
    df["vol_return"]   = df["volume"].pct_change()
    df["log_return"]   = np.log(df["close"] / df["close"].shift(1))
    df["volume_ratio"] = df["volume"] / df["volume"].rolling(20).mean()
    df["trade_count_ratio"] = df["trade_count"] / df["trade_count"].rolling(20).mean()

    # ── Volatility ───────────────────────────────────────────────────────────
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - df["close"].shift(1)).abs(),
        (df["low"]  - df["close"].shift(1)).abs(),
    ], axis=1).max(axis=1)
    df["atr_14"]      = tr.ewm(span=14, adjust=False).mean()
    df["rolling_vol"] = df["log_return"].rolling(10).std()

    # ── Bollinger Bands (20-period, 2σ) ──────────────────────────────────────
    bb_mid   = df["close"].rolling(20).mean()
    bb_std   = df["close"].rolling(20).std()
    bb_upper = bb_mid + 2 * bb_std
    bb_lower = bb_mid - 2 * bb_std
    bb_range = (bb_upper - bb_lower).replace(0, float("nan"))
    df["bb_width"] = bb_range / bb_mid
    df["bb_pct"]   = (df["close"] - bb_lower) / bb_range

    # ── VWAP deviation ───────────────────────────────────────────────────────
    df["vwap_dev"] = (df["close"] - df["vwap"]) / df["vwap"]

    # ── RSI (14-period) ──────────────────────────────────────────────────────
    delta    = df["close"].diff()
    avg_gain = delta.clip(lower=0).ewm(span=14, adjust=False).mean()
    avg_loss = (-delta.clip(upper=0)).ewm(span=14, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, float("nan"))
    df["rsi_14"] = 100 - (100 / (1 + rs))

    # ── Stochastic oscillator (14-period %K, 3-period %D) ───────────────────
    low_14  = df["low"].rolling(14).min()
    high_14 = df["high"].rolling(14).max()
    hl_range = (high_14 - low_14).replace(0, float("nan"))
    df["stoch_k"] = 100 * (df["close"] - low_14) / hl_range
    df["stoch_d"] = df["stoch_k"].rolling(3).mean()

    # ── Time of day (circular, consistent with any UTC-naive timestamp) ──────
    minute_of_day  = df["timestamp"].dt.hour * 60 + df["timestamp"].dt.minute
    df["hour_sin"] = np.sin(2 * np.pi * minute_of_day / 1440)
    df["hour_cos"] = np.cos(2 * np.pi * minute_of_day / 1440)

    return df


def drop_feature_nans(df: pd.DataFrame) -> pd.DataFrame:
    return df.dropna().reset_index(drop=True)


def scale_features(
    df: pd.DataFrame,
    feature_cols: list[str],
    scaler: RobustScaler | None = None,
) -> tuple[pd.DataFrame, RobustScaler]:
    """Fit (or apply) a RobustScaler on feature_cols. Returns (df, scaler)."""
    if scaler is None:
        scaler = RobustScaler()
        df[feature_cols] = scaler.fit_transform(df[feature_cols])
    else:
        df[feature_cols] = scaler.transform(df[feature_cols])
    return df, scaler


def make_windows(df: pd.DataFrame, feature_cols: list[str], window_size: int) -> np.ndarray:
    """Sliding windows via stride tricks. Returns (N, window_size, n_features) float32."""
    data = df[feature_cols].to_numpy(dtype=np.float32)
    X = np.lib.stride_tricks.sliding_window_view(data, window_shape=window_size, axis=0)
    return X.transpose(0, 2, 1)  # (N, window_size, n_features)


def filter_gap_windows(
    X: np.ndarray,
    df: pd.DataFrame,
    window_size: int,
    gap_seconds: float = 300.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Remove windows spanning overnight/weekend gaps. Returns (X_clean, valid_mask)."""
    diffs = df["timestamp"].diff().dt.total_seconds().fillna(0).to_numpy()
    gap_positions = np.where(diffs > gap_seconds)[0]
    valid_mask = np.ones(len(X), dtype=bool)
    for gp in gap_positions:
        lo = max(0, gp - window_size + 1)
        hi = min(len(X), gp + 1)
        valid_mask[lo:hi] = False
    return X[valid_mask], valid_mask


def run_pipeline(
    symbol: str | None = None,
    timeframe: str | None = None,
    max_bars: int | None = None,
) -> tuple[np.ndarray, pd.DataFrame, RobustScaler]:
    """
    Full pipeline: load CSV → clean → features → scale → windows → gap filter.
    Returns (X_clean, df_clean, scaler).
    """
    cfg = config_manager.load()
    symbol    = symbol    or cfg["symbol"]
    timeframe = timeframe or cfg["timeframe"]
    feat_cols = config_manager.feature_cols()
    window_size = cfg["window_size"]

    df = load_bars(symbol, timeframe, max_bars)
    df = clean_data(df)
    df = add_features(df)
    df = drop_feature_nans(df)
    df, scaler = scale_features(df, feat_cols)
    X = make_windows(df, feat_cols, window_size)
    X_clean, _ = filter_gap_windows(X, df, window_size)
    return X_clean, df, scaler


# ── Model bundle storage ──────────────────────────────────────────────────────
#
# Each trained model lives in its own directory:
#   models/{name}/
#       model.pt      — encoder/decoder weights
#       scaler.pkl    — RobustScaler fitted on training data
#       kmeans.pkl    — K-Means fitted on latent vectors (added by Latent Space page)
#       meta.json     — symbol, timeframe, hyperparams, saved_at, has_kmeans
#
# models/active.json → {"name": "<bundle-name>"}  points to the active bundle.
# All load functions read from the active bundle — no file copying on activation.

def _active_json_path() -> str:
    return os.path.join(config_manager.models_dir(), "active.json")


def active_model_name() -> str | None:
    """Return the name of the active bundle, or None."""
    path = _active_json_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            return json.load(f).get("name") or None
    except Exception:
        return None


def bundle_dir(name: str) -> str:
    return os.path.join(config_manager.models_dir(), name)


def _active_bundle_dir() -> str | None:
    name = active_model_name()
    if not name:
        return None
    d = bundle_dir(name)
    return d if os.path.isdir(d) else None


def save_named_model(name: str, model: Any, scaler: RobustScaler, cfg: dict) -> None:
    """Save model + scaler + meta into models/{name}/ and mark it active."""
    d = bundle_dir(name)
    os.makedirs(d, exist_ok=True)
    torch.save(model.state_dict(), os.path.join(d, "model.pt"))
    joblib.dump(scaler, os.path.join(d, "scaler.pkl"))
    meta = {
        "name":        name,
        "symbol":      cfg.get("symbol", ""),
        "timeframe":   cfg.get("timeframe", ""),
        "window_size": cfg.get("window_size", 0),
        "latent_dim":  cfg.get("latent_dim", 0),
        "n_clusters":  cfg.get("n_clusters", 0),
        "saved_at":    datetime.now().isoformat(timespec="seconds"),
        "has_kmeans":  False,
    }
    with open(os.path.join(d, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    os.makedirs(config_manager.models_dir(), exist_ok=True)
    with open(_active_json_path(), "w") as f:
        json.dump({"name": name}, f)


def load_model(n_features: int, latent_dim: int, device: torch.device) -> Any:
    d = _active_bundle_dir()
    if d is None:
        raise FileNotFoundError("No active model — train a named model first.")
    from neural.model import ConvAutoencoder
    m = ConvAutoencoder(n_features, latent_dim).to(device)
    m.load_state_dict(torch.load(os.path.join(d, "model.pt"), map_location=device))
    m.eval()
    return m


def load_scaler() -> RobustScaler:
    d = _active_bundle_dir()
    if d is None:
        raise FileNotFoundError("No active model — train a named model first.")
    return joblib.load(os.path.join(d, "scaler.pkl"))


def save_kmeans(kmeans: Any) -> str:
    """Save K-Means into the active bundle and set has_kmeans in meta.json."""
    d = _active_bundle_dir()
    if d is None:
        raise RuntimeError("No active model bundle — train a named model first.")
    path = os.path.join(d, "kmeans.pkl")
    joblib.dump(kmeans, path)
    meta_path = os.path.join(d, "meta.json")
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            meta = json.load(f)
        meta["has_kmeans"] = True
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)
    return path


def load_kmeans() -> Any:
    d = _active_bundle_dir()
    if d is None:
        raise FileNotFoundError("No active model — train a named model first.")
    path = os.path.join(d, "kmeans.pkl")
    if not os.path.exists(path):
        raise FileNotFoundError(
            "No K-Means in this bundle — run Latent Space → Extract + Cluster first."
        )
    return joblib.load(path)


def model_exists() -> bool:
    d = _active_bundle_dir()
    return d is not None and os.path.exists(os.path.join(d, "model.pt"))


def scaler_exists() -> bool:
    d = _active_bundle_dir()
    return d is not None and os.path.exists(os.path.join(d, "scaler.pkl"))


def kmeans_exists() -> bool:
    d = _active_bundle_dir()
    return d is not None and os.path.exists(os.path.join(d, "kmeans.pkl"))


def list_models() -> list[dict]:
    """Return all model bundles (subdirs with meta.json), newest first."""
    models_dir = config_manager.models_dir()
    if not os.path.isdir(models_dir):
        return []
    active = active_model_name()
    result = []
    for name in os.listdir(models_dir):
        d = os.path.join(models_dir, name)
        if not os.path.isdir(d):
            continue
        meta_path = os.path.join(d, "meta.json")
        if not os.path.exists(meta_path):
            continue
        try:
            with open(meta_path) as f:
                meta = json.load(f)
        except Exception:
            continue
        meta["name"]      = name
        meta["is_active"] = (name == active)
        result.append(meta)
    result.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
    return result


def activate_model(name: str) -> None:
    """Mark a bundle as active. No file copying — load functions read from bundle dir."""
    d = bundle_dir(name)
    if not os.path.isdir(d):
        raise FileNotFoundError(f"No bundle directory for '{name}'")
    if not os.path.exists(os.path.join(d, "model.pt")):
        raise FileNotFoundError(f"No model.pt in bundle '{name}'")
    os.makedirs(config_manager.models_dir(), exist_ok=True)
    with open(_active_json_path(), "w") as f:
        json.dump({"name": name}, f)


def deactivate_model() -> None:
    """Clear the active pointer — no model is active after this call."""
    os.makedirs(config_manager.models_dir(), exist_ok=True)
    with open(_active_json_path(), "w") as f:
        json.dump({"name": None}, f)


def delete_named_model(name: str) -> None:
    """Delete a bundle directory. Clears active pointer if it was active."""
    d = bundle_dir(name)
    if os.path.isdir(d):
        shutil.rmtree(d)
    if active_model_name() == name:
        with open(_active_json_path(), "w") as f:
            json.dump({"name": None}, f)
