"""
api/windows.py — GET /api/windows

Returns N sampled training windows as uint8 pixel arrays for
canvas rendering in the frontend (Windows page).
"""

import numpy as np
from fastapi import APIRouter, Query

from services import config_manager, storage

router = APIRouter(prefix="/api/windows", tags=["windows"])


@router.get("")
def get_windows(n: int = Query(default=2000, ge=1, le=10000)) -> dict:
    """
    Return N windows as uint8 pixel arrays clipped to (p2, p98).

    Response
    --------
    {
      "n_windows": int,
      "window_size": int,
      "n_features": int,
      "feature_cols": list[str],
      "windows": list[list[list[int]]]  -- shape (N, window_size, n_features)
    }
    """
    X_clean, _, _ = storage.run_pipeline()
    feat_cols = config_manager.feature_cols()

    n = min(n, len(X_clean))
    sample = X_clean[:n]  # (N, window_size, n_features)

    p2, p98 = np.percentile(sample, 2), np.percentile(sample, 98)
    rng = p98 - p2 if p98 > p2 else 1.0
    sample_u8 = np.clip((sample - p2) / rng * 255, 0, 255).astype(np.uint8)

    return {
        "n_windows":   n,
        "window_size": sample_u8.shape[1],
        "n_features":  sample_u8.shape[2],
        "feature_cols": feat_cols,
        "windows":     sample_u8.tolist(),
    }
