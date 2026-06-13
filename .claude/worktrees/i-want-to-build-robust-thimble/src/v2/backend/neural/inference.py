"""
neural/inference.py — Walk-forward bar-by-bar inference.

Returns results as Python dicts — no matplotlib, no API knowledge.
The API layer streams each result via WebSocket.
"""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator

import numpy as np
import pandas as pd
import torch

from neural.model import ConvAutoencoder
from services import config_manager, storage


async def walk_forward(
    symbol: str | None = None,
    timeframe: str | None = None,
    infer_start: str | None = None,
    infer_end: str | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Yield one result dict per bar in [infer_start, infer_end].

    Each dict contains:
        timestamp    : str  — ISO 8601 timestamp of the window's final bar
        mse          : float — reconstruction error
        cluster_label: int  — K-Means cluster assignment
        latent_vector: list[float] — 32-dim latent representation
    """
    cfg         = config_manager.load()
    symbol      = symbol    or cfg["symbol"]
    timeframe   = timeframe or cfg["timeframe"]
    window_size = cfg["window_size"]
    latent_dim  = cfg["latent_dim"]
    feat_cols   = config_manager.feature_cols()
    device      = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # Load artifacts
    model  = storage.load_model(len(feat_cols), latent_dim, device)
    scaler = storage.load_scaler()
    kmeans = storage.load_kmeans()

    # Load and prepare the full DataFrame (warm-up bars + inference range)
    df = storage.load_bars(symbol, timeframe)
    df = storage.clean_data(df)
    df = storage.add_features(df)
    df = storage.drop_feature_nans(df)
    df, _ = storage.scale_features(df, feat_cols, scaler)

    # Determine row range
    start_ts = pd.Timestamp(infer_start) if infer_start else df["timestamp"].iloc[window_size]
    end_ts   = pd.Timestamp(infer_end)   if infer_end   else df["timestamp"].iloc[-1]
    mask     = (df["timestamp"] >= start_ts) & (df["timestamp"] <= end_ts)
    infer_rows = df.index[mask]

    if len(infer_rows) == 0:
        raise ValueError(
            f"No bars in [{infer_start}, {infer_end}]. "
            f"CSV covers {df['timestamp'].iloc[0]} → {df['timestamp'].iloc[-1]}."
        )

    first_end_idx = int(infer_rows[0]) + window_size - 1
    last_end_idx  = int(infer_rows[-1])

    if first_end_idx - window_size + 1 < 0:
        raise ValueError("Not enough warm-up bars before infer_start.")

    model.eval()
    for i in range(first_end_idx, last_end_idx + 1):
        window_np = df[feat_cols].iloc[i - window_size + 1 : i + 1].to_numpy(dtype=np.float32)
        window_t  = torch.tensor(window_np).T.unsqueeze(0).to(device)

        with torch.no_grad():
            z_t     = model.encoder(window_t)
            recon_t = model.decoder(z_t)

        z     = z_t.cpu().numpy()[0]
        recon = recon_t.cpu().numpy()[0].T
        mse   = float(((window_np - recon) ** 2).mean())
        label = int(kmeans.predict(z.reshape(1, -1))[0])
        ts    = str(df["timestamp"].iloc[i])

        # Normalize window to 0-255 for canvas display: shape (n_features, window_size)
        w_min, w_max = window_np.min(), window_np.max()
        window_pixels = (
            ((window_np.T - w_min) / (w_max - w_min + 1e-8) * 255)
            .astype(np.uint8)
            .tolist()
        )

        await asyncio.sleep(0)  # yield control so stop requests are processed between bars
        yield {
            "timestamp":     ts,
            "mse":           mse,
            "cluster_label": label,
            "latent_vector": z.tolist(),
            "window_pixels": window_pixels,
        }
