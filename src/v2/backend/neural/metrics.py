"""
neural/metrics.py — Cluster quality metrics for K-Means evaluation.

Pure functions returning dicts of scalar values — no matplotlib, no API.
"""

from __future__ import annotations

import numpy as np
from sklearn.metrics import (
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)


def cluster_quality(
    Z: np.ndarray,
    k_range: range | list[int] | None = None,
) -> dict[int, dict[str, float]]:
    """
    Compute silhouette, Davies-Bouldin, and Calinski-Harabasz for each K.

    Parameters
    ----------
    Z       : Latent vectors, shape (N, latent_dim).
    k_range : Values of K to evaluate. Defaults to range(2, 17).

    Returns
    -------
    {k: {"silhouette": float, "davies_bouldin": float, "calinski_harabasz": float}}
    """
    from sklearn.cluster import KMeans

    if k_range is None:
        k_range = range(2, 17)

    results: dict[int, dict[str, float]] = {}
    for k in k_range:
        km = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = km.fit_predict(Z)
        results[k] = {
            "silhouette":        float(silhouette_score(Z, labels)),
            "davies_bouldin":    float(davies_bouldin_score(Z, labels)),
            "calinski_harabasz": float(calinski_harabasz_score(Z, labels)),
        }
    return results


def per_feature_mse(original: np.ndarray, reconstructed: np.ndarray) -> dict[str, float]:
    """
    Mean squared error per feature column across all samples.

    Parameters
    ----------
    original / reconstructed : shape (N, window_size, n_features)

    Returns
    -------
    {"feature_0": mse, "feature_1": mse, ...}
    """
    mse_per_feature = ((original - reconstructed) ** 2).mean(axis=(0, 1))
    return {f"feature_{i}": float(v) for i, v in enumerate(mse_per_feature)}
