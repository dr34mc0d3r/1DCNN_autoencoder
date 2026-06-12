"""tests/api/test_reconstruct.py"""

import pytest


def _ensure_model(tmp_backend, patch_config_manager):
    """Save an untrained model and scaler if not already present."""
    from services import storage, config_manager
    from neural.model import ConvAutoencoder
    if not storage.model_exists():
        cfg   = config_manager.load()
        model = ConvAutoencoder(14, cfg["latent_dim"])
        storage.save_model(model)
    if not storage.scaler_exists():
        _, _, scaler = storage.run_pipeline()
        storage.save_scaler(scaler)


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
