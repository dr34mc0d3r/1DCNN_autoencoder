"""tests/neural/test_inference.py"""

import asyncio

import numpy as np
import pytest
import torch


@pytest.mark.asyncio
async def test_walk_forward_yields_dicts(tmp_backend, patch_config_manager, monkeypatch):
    """
    walk_forward should yield dicts with the expected keys for each bar.
    We mock the model and kmeans so no real artifacts are needed.
    """
    from services import config_manager, storage
    from neural.model import ConvAutoencoder

    cfg = config_manager.load()

    # Save a real scaler from the pipeline
    X_clean, df, scaler = storage.run_pipeline()
    storage.save_scaler(scaler)

    # Save a tiny untrained model
    model = ConvAutoencoder(14, cfg["latent_dim"])
    storage.save_model(model)

    # Save a trivial kmeans
    from sklearn.cluster import KMeans
    import numpy as _np
    Z_fake = _np.random.rand(50, cfg["latent_dim"]).astype(_np.float32)
    km = KMeans(n_clusters=cfg["n_clusters"], n_init=3, random_state=0).fit(Z_fake)
    storage.save_kmeans(km)

    # Use the actual CSV date range
    ts_first = str(df["timestamp"].iloc[0].date())
    ts_last  = str(df["timestamp"].iloc[-1].date())

    from neural.inference import walk_forward
    results = []
    async for item in walk_forward(infer_start=ts_first, infer_end=ts_last):
        results.append(item)
        if len(results) >= 3:
            break

    assert len(results) > 0
    for r in results:
        assert "timestamp" in r
        assert "mse" in r
        assert "cluster_label" in r
        assert "latent_vector" in r


@pytest.mark.asyncio
async def test_walk_forward_bad_date_range(tmp_backend, patch_config_manager):
    """walk_forward should raise ValueError when the date range has no bars."""
    from neural.inference import walk_forward

    with pytest.raises(ValueError, match="No bars in"):
        async for _ in walk_forward(infer_start="1990-01-01", infer_end="1990-01-31"):
            pass
