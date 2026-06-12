"""
api/cluster.py — POST /api/cluster and GET /api/cluster/quality.

Extracts latent vectors for all training windows, fits K-Means,
runs t-SNE, and returns scatter + centroid data for the Latent Space page.
"""

import logging

import numpy as np
import torch
from fastapi import APIRouter, BackgroundTasks, HTTPException

from neural.metrics import cluster_quality
from services import config_manager, storage
from websocket.live import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cluster", tags=["cluster"])

_state: dict = {"state": "idle", "result": None, "error": None}


async def _run_cluster() -> None:
    _state.update({"state": "running", "result": None, "error": None})
    try:
        cfg        = config_manager.load()
        feat_cols  = config_manager.feature_cols()
        n_clusters = cfg["n_clusters"]
        latent_dim = cfg["latent_dim"]
        device     = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        X_clean, _, scaler = storage.run_pipeline()
        model = storage.load_model(len(feat_cols), latent_dim, device)

        # Extract latent vectors for all clean windows
        X_t = torch.tensor(X_clean).permute(0, 2, 1).to(device)
        model.eval()
        with torch.no_grad():
            Z = model.encoder(X_t).cpu().numpy()  # (N, latent_dim)

        # Fit K-Means
        from sklearn.cluster import KMeans
        km = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
        labels = km.fit_predict(Z).tolist()
        storage.save_kmeans(km)

        # t-SNE — subsample to keep runtime reasonable
        n_tsne = min(5000, len(Z))
        idx    = np.random.choice(len(Z), n_tsne, replace=False)
        Z_sub  = Z[idx]
        lbl_sub = [labels[i] for i in idx]

        from sklearn.manifold import TSNE
        tsne_coords = TSNE(n_components=2, random_state=42, perplexity=30).fit_transform(Z_sub)

        # Centroid profiles
        centroids = km.cluster_centers_.tolist()  # (n_clusters, latent_dim)

        scatter = [
            {"x": float(tsne_coords[i, 0]), "y": float(tsne_coords[i, 1]), "label": lbl_sub[i]}
            for i in range(n_tsne)
        ]

        _state.update({
            "state": "done",
            "result": {
                "n_clusters": n_clusters,
                "n_windows":  len(Z),
                "scatter":    scatter,
                "centroids":  centroids,
                "labels":     labels,
            },
        })
        await manager.send("cluster_complete", {"n_clusters": n_clusters, "n_windows": len(Z)})
    except Exception as exc:
        logger.exception("Clustering failed")
        _state.update({"state": "error", "error": str(exc)})
        await manager.send("error", {"message": str(exc)})


@router.post("")
def start_cluster(background_tasks: BackgroundTasks) -> dict:
    if _state["state"] == "running":
        raise HTTPException(409, "Clustering already in progress")
    background_tasks.add_task(_run_cluster)
    return {"status": "started"}


@router.get("")
def get_cluster_result() -> dict:
    return _state


@router.get("/quality")
def get_cluster_quality() -> dict:
    """Compute silhouette / Davies-Bouldin / Calinski-Harabasz for K=2..16."""
    cfg       = config_manager.load()
    feat_cols = config_manager.feature_cols()
    latent_dim = cfg["latent_dim"]
    device    = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    X_clean, _, _ = storage.run_pipeline()
    model = storage.load_model(len(feat_cols), latent_dim, device)

    X_t = torch.tensor(X_clean).permute(0, 2, 1).to(device)
    model.eval()
    with torch.no_grad():
        Z = model.encoder(X_t).cpu().numpy()

    scores = cluster_quality(Z)
    return {"scores": {str(k): v for k, v in scores.items()}}
