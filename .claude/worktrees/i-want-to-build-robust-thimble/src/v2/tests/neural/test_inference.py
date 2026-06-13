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

    # Save a named bundle (model + scaler) and mark it active
    X_clean, df, scaler = storage.run_pipeline()
    model = ConvAutoencoder(14, cfg["latent_dim"])
    storage.save_named_model("test_model", model, scaler, cfg)

    # Save a trivial kmeans into the active bundle
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
    from services import storage, config_manager
    from neural.model import ConvAutoencoder
    from neural.inference import walk_forward

    # Need an active bundle or walk_forward raises FileNotFoundError before ValueError
    cfg = config_manager.load()
    _, _, scaler = storage.run_pipeline()
    storage.save_named_model("test_model", ConvAutoencoder(14, cfg["latent_dim"]), scaler, cfg)

    with pytest.raises(ValueError, match="No bars in"):
        async for _ in walk_forward(infer_start="1990-01-01", infer_end="1990-01-31"):
            pass
