"""
api/reconstruct.py — POST /api/reconstruct and GET /api/temporal.

Reconstruction comparison and temporal cluster pattern analysis.
"""

import json
import logging
import os
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
import torch
from fastapi import APIRouter, Query
from pydantic import BaseModel

from neural.metrics import per_feature_mse
from services import config_manager, storage

logger = logging.getLogger(__name__)
router = APIRouter(tags=["reconstruct"])


class ReconstructRequest(BaseModel):
    n: Optional[int] = 500


@router.post("/api/reconstruct")
def run_reconstruct(req: ReconstructRequest) -> dict:
    """
    Encode + decode N sampled windows; return originals, reconstructions, per-feature MSE.

    Response keys
    -------------
    original        : list[list[list[float]]] — (N, window_size, n_features)
    reconstructed   : list[list[list[float]]] — same shape
    per_feature_mse : dict[str, float] — keyed by feature name
    overall_mse     : float
    """
    cfg       = config_manager.load()
    feat_cols = config_manager.feature_cols()
    latent_dim = cfg["latent_dim"]
    device    = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    saved_scaler = storage.load_scaler()
    X_clean, _, _ = storage.run_pipeline(scaler=saved_scaler)
    n = min(req.n or 500, len(X_clean))
    sample = X_clean[:n]  # (N, window_size, n_features)

    model = storage.load_model(len(feat_cols), latent_dim, device)
    X_t = torch.tensor(sample).permute(0, 2, 1).to(device)
    model.eval()
    with torch.no_grad():
        recon_t = model(X_t).cpu().numpy()  # (N, n_features, window_size)

    recon = recon_t.transpose(0, 2, 1)  # → (N, window_size, n_features)
    mse_map = per_feature_mse(sample, recon)
    # Rename keys from feature_0..N to actual column names
    named_mse = {feat_cols[int(k.split("_")[1])]: v for k, v in mse_map.items()}

    overall_mse = float(((sample - recon) ** 2).mean())

    # Persist reconstruction_stats.json
    d = storage._active_bundle_dir()
    if d:
        with open(os.path.join(d, "reconstruction_stats.json"), "w") as fh:
            json.dump({
                "overall_mse":     round(overall_mse, 8),
                "per_feature_mse": {k: round(v, 8) for k, v in named_mse.items()},
                "n_samples":       n,
                "computed_at":     datetime.now().isoformat(timespec="seconds"),
            }, fh, indent=2)

    return {
        "original":        sample.tolist(),
        "reconstructed":   recon.tolist(),
        "per_feature_mse": named_mse,
        "overall_mse":     overall_mse,
    }


@router.get("/api/temporal")
def get_temporal() -> dict:
    """
    Return cluster label timeline + by-hour and by-weekday distributions.

    Requires model + kmeans to be saved. Encodes all training windows.
    """
    cfg        = config_manager.load()
    feat_cols  = config_manager.feature_cols()
    latent_dim = cfg["latent_dim"]
    window_size = cfg["window_size"]
    device     = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    saved_scaler = storage.load_scaler()
    X_clean, df_full, _ = storage.run_pipeline(scaler=saved_scaler)
    model  = storage.load_model(len(feat_cols), latent_dim, device)
    kmeans = storage.load_kmeans()

    X_t = torch.tensor(X_clean).permute(0, 2, 1).to(device)
    model.eval()
    with torch.no_grad():
        Z = model.encoder(X_t).cpu().numpy()

    labels = kmeans.predict(Z).tolist()

    # Align timestamps: each window's timestamp = last bar of that window
    # Window i ends at row i + window_size - 1 in df_full
    timestamps = df_full["timestamp"].iloc[window_size - 1: window_size - 1 + len(labels)].tolist()
    ts_series  = pd.to_datetime(timestamps)

    timeline = [
        {"timestamp": str(ts), "label": lbl}
        for ts, lbl in zip(ts_series, labels)
    ]

    by_hour = (
        pd.DataFrame({"hour": ts_series.hour, "label": labels})
        .groupby(["hour", "label"])
        .size()
        .reset_index(name="count")
        .to_dict(orient="records")
    )

    by_weekday = (
        pd.DataFrame({"weekday": ts_series.weekday, "label": labels})
        .groupby(["weekday", "label"])
        .size()
        .reset_index(name="count")
        .to_dict(orient="records")
    )

    return {
        "timeline":   timeline,
        "by_hour":    by_hour,
        "by_weekday": by_weekday,
    }
