"""
config_manager.py — Reads and writes backend/config/config.json.

Every other module receives configuration values from here. No module should
hard-code defaults — call config_manager.get() instead.
"""

from __future__ import annotations

import json
import os
from typing import Any

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "config.json")

_DEFAULTS: dict[str, Any] = {
    "alpaca_key": "",
    "alpaca_secret": "",
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
    "guard_patience": 7,
    "guard_min_delta": 1e-5,
    "guard_overfit_ratio": 2.5,
    "guard_explosion_factor": 10.0,
    "guard_oscillation_window": 5,
    "guard_oscillation_cv": 0.4,
    "guard_collapse_threshold": 1e-6,
}

_FEATURE_COLS = [
    "ema_9", "ema_21", "ema_50",
    "macd", "macd_9", "macd_hist",
    "body", "upper_wick", "lower_wick",
    "return", "vol_return", "log_return", "volume_ratio",
    "close",
]


def _config_path() -> str:
    return os.path.abspath(_CONFIG_PATH)


def load() -> dict[str, Any]:
    """Return the current config, merged with defaults for any missing keys."""
    path = _config_path()
    if os.path.exists(path):
        with open(path) as f:
            data = json.load(f)
    else:
        data = {}
    return {**_DEFAULTS, **data}


def get(key: str, default: Any = None) -> Any:
    """Return one config value by key."""
    return load().get(key, default)


def update(partial: dict[str, Any]) -> dict[str, Any]:
    """Merge partial into the saved config and write to disk. Returns full config."""
    current = load()
    current.update(partial)
    path = _config_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(current, f, indent=2)
    return current


def feature_cols() -> list[str]:
    """Return the fixed list of 14 feature column names."""
    return list(_FEATURE_COLS)


def models_dir() -> str:
    """Return the absolute path to the models/ directory."""
    base = os.path.join(os.path.dirname(__file__), "..", "models")
    return os.path.abspath(base)


def downloads_dir() -> str:
    """Return the absolute path to the downloads/ directory."""
    base = os.path.join(os.path.dirname(__file__), "..", "downloads")
    return os.path.abspath(base)
