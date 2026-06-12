"""
services/storage.py — All file I/O for the v2 backend.

Consolidates CSV bar loading, model artifact save/load, and the data
pipeline (clean, feature-engineer, scale, window, gap-filter).
All paths are rooted under backend/downloads/ and backend/models/.
"""

from __future__ import annotations

import os
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
    df["ema_9"]  = df["close"].ewm(span=9,  adjust=False).mean()
    df["ema_21"] = df["close"].ewm(span=21, adjust=False).mean()
    df["ema_50"] = df["close"].ewm(span=50, adjust=False).mean()
    ema_12         = df["close"].ewm(span=12, adjust=False).mean()
    ema_26         = df["close"].ewm(span=26, adjust=False).mean()
    df["macd"]     = ema_12 - ema_26
    df["macd_9"]   = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_hist"]= df["macd"] - df["macd_9"]
    df["body"]        = df["close"] - df["open"]
    df["upper_wick"]  = df["high"] - df[["open", "close"]].max(axis=1)
    df["lower_wick"]  = df[["open", "close"]].min(axis=1) - df["low"]
    df["return"]      = df["close"].pct_change()
    df["vol_return"]  = df["volume"].pct_change()
    df["log_return"]  = np.log(df["close"] / df["close"].shift(1))
    df["volume_ratio"]= df["volume"] / df["volume"].rolling(20).mean()
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


# ── Model artifacts ───────────────────────────────────────────────────────────

def _model_path() -> str:
    return os.path.join(config_manager.models_dir(), "model.pt")

def _scaler_path() -> str:
    return os.path.join(config_manager.models_dir(), "scaler.pkl")

def _kmeans_path() -> str:
    return os.path.join(config_manager.models_dir(), "kmeans.pkl")


def save_model(model: Any, device: torch.device | None = None) -> str:
    os.makedirs(config_manager.models_dir(), exist_ok=True)
    path = _model_path()
    torch.save(model.state_dict(), path)
    return path


def load_model(n_features: int, latent_dim: int, device: torch.device) -> Any:
    from neural.model import ConvAutoencoder
    m = ConvAutoencoder(n_features, latent_dim).to(device)
    m.load_state_dict(torch.load(_model_path(), map_location=device))
    m.eval()
    return m


def save_scaler(scaler: RobustScaler) -> str:
    os.makedirs(config_manager.models_dir(), exist_ok=True)
    path = _scaler_path()
    joblib.dump(scaler, path)
    return path


def load_scaler() -> RobustScaler:
    return joblib.load(_scaler_path())


def save_kmeans(kmeans: Any) -> str:
    os.makedirs(config_manager.models_dir(), exist_ok=True)
    path = _kmeans_path()
    joblib.dump(kmeans, path)
    return path


def load_kmeans() -> Any:
    return joblib.load(_kmeans_path())


def model_exists() -> bool:
    return os.path.exists(_model_path())

def scaler_exists() -> bool:
    return os.path.exists(_scaler_path())

def kmeans_exists() -> bool:
    return os.path.exists(_kmeans_path())
