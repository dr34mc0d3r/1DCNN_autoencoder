"""tests/api/test_reconstruct.py"""

import pytest


def _ensure_model(tmp_backend, patch_config_manager):
    """Save a named bundle with an untrained model and scaler if not already present."""
    from services import storage, config_manager
    from neural.model import ConvAutoencoder
    if not storage.model_exists():
        cfg = config_manager.load()
        _, _, scaler = storage.run_pipeline()
        model = ConvAutoencoder(14, cfg["latent_dim"])
        storage.save_named_model("test_model", model, scaler, cfg)


def test_reconstruct_returns_200(client, tmp_backend, patch_config_manager, sample_X):
    _ensure_model(tmp_backend, patch_config_manager)
    resp = client.post("/api/reconstruct", json={"n": 5})
    assert resp.status_code == 200


def test_reconstruct_response_keys(client, tmp_backend, patch_config_manager, sample_X):
    _ensure_model(tmp_backend, patch_config_manager)
    body = client.post("/api/reconstruct", json={"n": 5}).json()
    for key in ("original", "reconstructed", "per_feature_mse", "overall_mse"):
        assert key in body


def test_temporal_returns_200(client, tmp_backend, patch_config_manager, sample_X):
    from services import storage, config_manager
    from neural.model import ConvAutoencoder
    from sklearn.cluster import KMeans
    import numpy as np

    _ensure_model(tmp_backend, patch_config_manager)
    if not storage.kmeans_exists():
        cfg = config_manager.load()
        Z = np.random.rand(50, cfg["latent_dim"]).astype(np.float32)
        km = KMeans(n_clusters=cfg["n_clusters"], n_init=3, random_state=0).fit(Z)
        storage.save_kmeans(km)

    resp = client.get("/api/temporal")
    assert resp.status_code == 200


# ── GET /api/temporal — shape and content tests ───────────────────────────────

def _ensure_model_and_kmeans(tmp_backend, patch_config_manager):
    from services import storage, config_manager
    from sklearn.cluster import KMeans
    import numpy as np
    _ensure_model(tmp_backend, patch_config_manager)
    if not storage.kmeans_exists():
        cfg = config_manager.load()
        Z = np.random.rand(50, cfg["latent_dim"]).astype(np.float32)
        km = KMeans(n_clusters=cfg["n_clusters"], n_init=3, random_state=0).fit(Z)
        storage.save_kmeans(km)


def test_temporal_response_keys(client, tmp_backend, patch_config_manager):
    _ensure_model_and_kmeans(tmp_backend, patch_config_manager)
    body = client.get("/api/temporal").json()
    assert set(body.keys()) >= {"timeline", "by_hour", "by_weekday"}


def test_temporal_by_hour_entry_keys(client, tmp_backend, patch_config_manager):
    _ensure_model_and_kmeans(tmp_backend, patch_config_manager)
    body = client.get("/api/temporal").json()
    if body["by_hour"]:
        assert set(body["by_hour"][0].keys()) >= {"hour", "label", "count"}


def test_temporal_by_weekday_entry_keys(client, tmp_backend, patch_config_manager):
    _ensure_model_and_kmeans(tmp_backend, patch_config_manager)
    body = client.get("/api/temporal").json()
    if body["by_weekday"]:
        assert set(body["by_weekday"][0].keys()) >= {"weekday", "label", "count"}


def test_temporal_timeline_entry_keys(client, tmp_backend, patch_config_manager):
    _ensure_model_and_kmeans(tmp_backend, patch_config_manager)
    body = client.get("/api/temporal").json()
    if body["timeline"]:
        assert set(body["timeline"][0].keys()) >= {"timestamp", "label"}


def test_temporal_hour_values_in_range(client, tmp_backend, patch_config_manager):
    _ensure_model_and_kmeans(tmp_backend, patch_config_manager)
    body = client.get("/api/temporal").json()
    assert all(0 <= entry["hour"] <= 23 for entry in body["by_hour"])


def test_temporal_weekday_values_in_range(client, tmp_backend, patch_config_manager):
    _ensure_model_and_kmeans(tmp_backend, patch_config_manager)
    body = client.get("/api/temporal").json()
    assert all(0 <= entry["weekday"] <= 6 for entry in body["by_weekday"])
