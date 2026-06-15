"""
config_manager.py — Reads and writes backend/config/config.json.

Every other module receives configuration values from here. No module should
hard-code defaults — call config_manager.get() instead.
"""

from __future__ import annotations

import json
import os
from typing import Any

from dotenv import dotenv_values

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "config.json")

# Root .env is four levels up from services/: services/ → backend/ → v2/ → src/ → project root
_DOTENV_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".env")
)

_DEFAULTS: dict[str, Any] = {
    "alpaca_base_url": "https://data.alpaca.markets",
    "symbol": "TSLA",
    "timeframe": "1Min",
    "start_date": "2024-01-01",
    "end_date": "2025-01-01",
    "window_size": 64,
    "latent_dim": 32,
    "batch_size": 256,
    "epochs": 10,
    "lr": 0.001,
    "test_split": 0.2,
    "n_clusters": 8,
    "forward_return_horizon": 4,
    "guard_patience": 7,
    "guard_min_delta": 1e-5,
    "guard_overfit_ratio": 2.5,
    "guard_explosion_factor": 10.0,
    "guard_oscillation_window": 5,
    "guard_oscillation_cv": 0.4,
    "guard_collapse_threshold": 1e-6,
    # LR scheduler
    "scheduler": "none",
    "scheduler_plateau_factor":   0.5,
    "scheduler_plateau_patience": 5,
    "scheduler_plateau_min_lr":   1e-7,
    "scheduler_step_size":        10,
    "scheduler_step_gamma":       0.5,
    "scheduler_multistep_milestones": "20,40,60",
    "scheduler_multistep_gamma":  0.5,
    "scheduler_cosine_t_max":     50,
    "scheduler_cosine_eta_min":   1e-7,
    "scheduler_exp_gamma":        0.95,
    "scheduler_warmup_epochs":    5,
    "scheduler_warmup_start_factor": 0.1,
    "scheduler_cyclic_base_lr":   1e-5,
    "scheduler_cyclic_max_lr":    1e-2,
    "scheduler_cyclic_step_size": 10,
    "scheduler_cyclic_mode":      "triangular2",
    # System
    "logging_enabled": True,
}

_FEATURE_COLS = [
    # Trend
    "ema_9", "ema_21", "ema_50",
    # MACD
    "macd", "macd_9", "macd_hist",
    # Candle structure
    "body", "upper_wick", "lower_wick", "candle_efficiency",
    # Returns & volume
    "return", "vol_return", "log_return", "volume_ratio",
    # Volatility
    "atr_14", "rolling_vol",
    # Bollinger Bands
    "bb_width", "bb_pct",
    # VWAP
    "vwap_dev",
    # Momentum oscillators
    "rsi_14", "stoch_k", "stoch_d",
    # Time of day
    "hour_sin", "hour_cos",
    # Price level
    "close",
]


def _config_path() -> str:
    return os.path.abspath(_CONFIG_PATH)


def _load_env_credentials() -> dict[str, str]:
    """Read Alpaca credentials from the root .env file."""
    env = dotenv_values(_DOTENV_PATH)
    creds: dict[str, str] = {}
    if env.get("ALPACA_API_KEY"):
        creds["alpaca_key"] = env["ALPACA_API_KEY"]
    if env.get("ALPACA_SECRET_KEY"):
        creds["alpaca_secret"] = env["ALPACA_SECRET_KEY"]
    if env.get("ALPACA_DATA_BASE_URL"):
        creds["alpaca_base_url"] = env["ALPACA_DATA_BASE_URL"]
    return creds


def load() -> dict[str, Any]:
    """Return the current config merged from defaults, config.json, and root .env.

    Priority (highest wins): .env credentials > config.json > _DEFAULTS.
    Alpaca credentials always come from .env and are never written to config.json.
    """
    path = _config_path()
    if os.path.exists(path):
        with open(path) as f:
            data = json.load(f)
    else:
        data = {}
    return {**_DEFAULTS, **data, **_load_env_credentials()}


def get(key: str, default: Any = None) -> Any:
    """Return one config value by key."""
    return load().get(key, default)


_ENV_ONLY_KEYS = {"alpaca_key", "alpaca_secret"}


def update(partial: dict[str, Any]) -> dict[str, Any]:
    """Merge partial into the saved config and write to disk. Returns full config.

    Credential keys (alpaca_key, alpaca_secret) are silently dropped from the
    write — they live in .env only and must never be persisted to config.json.
    """
    path = _config_path()
    if os.path.exists(path):
        with open(path) as f:
            on_disk = json.load(f)
    else:
        on_disk = {}
    safe_partial = {k: v for k, v in partial.items() if k not in _ENV_ONLY_KEYS}
    on_disk.update(safe_partial)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(on_disk, f, indent=2)
    return load()


def feature_cols() -> list[str]:
    """Return the fixed list of feature column names fed to the model."""
    return list(_FEATURE_COLS)


def models_dir() -> str:
    """Return the absolute path to the models/ directory."""
    base = os.path.join(os.path.dirname(__file__), "..", "models")
    return os.path.abspath(base)


def downloads_dir() -> str:
    """Return the absolute path to the downloads/ directory."""
    base = os.path.join(os.path.dirname(__file__), "..", "downloads")
    return os.path.abspath(base)
