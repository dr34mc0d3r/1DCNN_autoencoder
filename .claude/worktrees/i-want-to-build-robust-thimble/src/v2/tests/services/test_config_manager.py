"""tests/services/test_config_manager.py"""

import json

import pytest

import services.config_manager as cm


def test_load_returns_dict(patch_config_manager):
    cfg = cm.load()
    assert isinstance(cfg, dict)
    assert cfg["symbol"] == "TEST"
    assert cfg["window_size"] == 64


def test_feature_cols_length():
    assert len(cm.feature_cols()) == 14


def test_feature_cols_includes_close():
    assert "close" in cm.feature_cols()


def test_get_known_key(patch_config_manager):
    assert cm.get("symbol") == "TEST"


def test_get_missing_key_returns_default():
    assert cm.get("nonexistent_key", "fallback") == "fallback"


def test_update_persists(tmp_backend, patch_config_manager):
    cm.update({"symbol": "AAPL"})
    reloaded = cm.load()
    assert reloaded["symbol"] == "AAPL"
    # Restore original value so other tests are unaffected
    cm.update({"symbol": "TEST"})


def test_update_merges_not_replaces(tmp_backend, patch_config_manager):
    original = cm.load()
    cm.update({"latent_dim": 99})
    updated = cm.load()
    assert updated["latent_dim"] == 99
    assert updated["window_size"] == original["window_size"]
    cm.update({"latent_dim": original["latent_dim"]})


def test_models_dir_is_string():
    assert isinstance(cm.models_dir(), str)


def test_downloads_dir_is_string():
    assert isinstance(cm.downloads_dir(), str)
