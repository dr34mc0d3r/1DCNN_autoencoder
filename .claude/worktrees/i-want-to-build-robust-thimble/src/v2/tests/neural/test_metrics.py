"""tests/neural/test_metrics.py"""

import numpy as np
import pytest

from neural.metrics import cluster_quality, per_feature_mse


def _latent(n=200, dim=8) -> np.ndarray:
    rng = np.random.default_rng(1)
    return rng.random((n, dim)).astype(np.float32)


def test_cluster_quality_keys():
    Z = _latent()
    scores = cluster_quality(Z, k_range=range(2, 5))
    assert set(scores.keys()) == {2, 3, 4}


def test_cluster_quality_has_silhouette():
    Z = _latent()
    scores = cluster_quality(Z, k_range=range(2, 4))
    for v in scores.values():
        assert "silhouette" in v
        assert "davies_bouldin" in v
        assert "calinski_harabasz" in v


def test_cluster_quality_silhouette_range():
    Z = _latent(300, 8)
    scores = cluster_quality(Z, k_range=range(2, 4))
    for v in scores.values():
        assert -1.0 <= v["silhouette"] <= 1.0


def test_per_feature_mse_shape():
    orig  = np.random.rand(10, 16, 14).astype(np.float32)
    recon = orig + np.random.rand(10, 16, 14).astype(np.float32) * 0.1
    mse   = per_feature_mse(orig, recon)
    assert len(mse) == 14


def test_per_feature_mse_perfect_reconstruction():
    X = np.random.rand(10, 16, 14).astype(np.float32)
    mse = per_feature_mse(X, X)
    for v in mse.values():
        assert abs(v) < 1e-6


def test_per_feature_mse_positive():
    orig  = np.random.rand(10, 16, 14).astype(np.float32)
    recon = orig + 1.0
    mse   = per_feature_mse(orig, recon)
    for v in mse.values():
        assert v > 0
