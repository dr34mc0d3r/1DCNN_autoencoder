"""
tests/conftest.py — Shared fixtures for the v2 test suite.

All tests run against an isolated tmp directory so they never touch
the real downloads/ or models/ directories.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures"
_SAMPLE_CONFIG = json.loads((FIXTURE_DIR / "sample_config.json").read_text())

WINDOW_SIZE = _SAMPLE_CONFIG["window_size"]   # 64
LATENT_DIM  = _SAMPLE_CONFIG["latent_dim"]    # 8
N_FEATURES  = 14


def _make_ohlcv_df(n: int = 600) -> pd.DataFrame:
    """Generate n synthetic 5-minute bars in one continuous session."""
    rng = np.random.default_rng(42)
    closes = 100.0 + np.cumsum(rng.normal(0, 0.1, n))
    opens  = np.roll(closes, 1)
    opens[0] = 100.0
    highs  = np.maximum(opens, closes) + rng.uniform(0.05, 0.3, n)
    lows   = np.minimum(opens, closes) - rng.uniform(0.05, 0.3, n)
    volumes = rng.integers(80_000, 120_000, n).astype(float)
    ts_start = pd.Timestamp("2023-01-03 14:30:00")
    timestamps = pd.date_range(ts_start, periods=n, freq="5min")
    return pd.DataFrame({
        "timestamp":   timestamps,
        "open":        opens,
        "high":        highs,
        "low":         lows,
        "close":       closes,
        "volume":      volumes,
        "vwap":        (opens + closes) / 2,
        "trade_count": rng.integers(400, 600, n).astype(float),
    })


# ── Session-scoped patch helpers ──────────────────────────────────────────────

class _MPatch:
    """Minimal session-scoped monkeypatching (pytest.monkeypatch is function-scoped)."""
    _patches: list = []

    @classmethod
    def setattr(cls, obj, name, val):
        cls._patches.append((obj, name, getattr(obj, name)))
        setattr(obj, name, val)

    @classmethod
    def undo(cls):
        for obj, name, orig in reversed(cls._patches):
            setattr(obj, name, orig)
        cls._patches.clear()


@pytest.fixture(scope="session")
def tmp_backend(tmp_path_factory):
    """
    Create an isolated backend directory with config, CSV bar data, and models/.
    Returns the root Path.
    """
    root = tmp_path_factory.mktemp("backend")

    cfg_path = root / "config" / "config.json"
    cfg_path.parent.mkdir()
    cfg_path.write_text(json.dumps(_SAMPLE_CONFIG))

    sym = _SAMPLE_CONFIG["symbol"]
    tf  = _SAMPLE_CONFIG["timeframe"]
    dl_dir = root / "downloads" / sym
    dl_dir.mkdir(parents=True)
    _make_ohlcv_df().to_csv(dl_dir / f"{tf}.csv", index=False)

    (root / "models").mkdir()
    return root


@pytest.fixture(scope="session", autouse=True)
def patch_config_manager(tmp_backend):
    """
    Redirect config_manager to use tmp config.json, models/, and downloads/.
    Applied for the entire test session.
    """
    import services.config_manager as cm

    cfg_str    = str(tmp_backend / "config" / "config.json")
    models_str = str(tmp_backend / "models")
    dl_str     = str(tmp_backend / "downloads")

    _MPatch.setattr(cm, "_CONFIG_PATH", cfg_str)
    orig_models   = cm.models_dir
    orig_downloads = cm.downloads_dir
    cm.models_dir    = lambda: models_str
    cm.downloads_dir = lambda: dl_str

    yield

    cm.models_dir    = orig_models
    cm.downloads_dir = orig_downloads
    _MPatch.undo()


# ── Common data fixtures ───────────────────────────────────────────────────────

@pytest.fixture
def sample_df() -> pd.DataFrame:
    return _make_ohlcv_df()


@pytest.fixture(scope="session")
def pipeline_outputs(tmp_backend, patch_config_manager):
    """Run the full pipeline once per session; return (X_clean, df, scaler)."""
    from services.storage import run_pipeline
    return run_pipeline()


@pytest.fixture(scope="session")
def sample_X(pipeline_outputs):
    return pipeline_outputs[0]


@pytest.fixture(scope="session")
def sample_df_pipeline(pipeline_outputs):
    return pipeline_outputs[1]


@pytest.fixture
def tiny_model():
    """Untrained ConvAutoencoder with test-sized dimensions."""
    from neural.model import ConvAutoencoder
    return ConvAutoencoder(n_features=N_FEATURES, latent_dim=LATENT_DIM)


@pytest.fixture
def client(tmp_backend, patch_config_manager):
    """Synchronous HTTPX TestClient wrapping the FastAPI app."""
    from fastapi.testclient import TestClient
    from app import app
    return TestClient(app, raise_server_exceptions=False)
