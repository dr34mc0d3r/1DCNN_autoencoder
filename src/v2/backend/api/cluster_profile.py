"""
api/cluster_profile.py — GET /api/cluster/profile, /representatives, /forward-returns.

Reads cluster artifacts saved during _run_cluster() to characterise each cluster:
feature fingerprints, decision tree rules, representative OHLCV windows, and
forward return distributions.
"""

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from sklearn.tree import DecisionTreeClassifier, export_text

from services import config_manager, storage

router = APIRouter(prefix="/api/cluster", tags=["cluster_profile"])


def _check_artifacts() -> None:
    if not storage.cluster_artifacts_exist():
        raise HTTPException(
            424,
            "Cluster artifacts not found. Run Extract + Cluster on the Latent Space page first.",
        )


def _raw_df(cfg: dict):
    """Run pipeline through drop_feature_nans only — no scaling, returns unscaled df."""
    df = storage.load_bars(cfg["symbol"], cfg["timeframe"])
    df = storage.clean_data(df)
    df = storage.add_features(df)
    df = storage.drop_feature_nans(df)
    return df


# ── /profile ──────────────────────────────────────────────────────────────────

@router.get("/profile")
def get_cluster_profile() -> dict:
    """Feature fingerprint + decision tree for all clusters."""
    _check_artifacts()
    window_means = storage.load_window_means()  # (N, n_features)
    labels       = storage.load_labels()        # (N,)  int32
    feat_cols    = config_manager.feature_cols()
    n_clusters   = int(labels.max()) + 1

    global_mean = window_means.mean(axis=0)
    global_std  = window_means.std(axis=0) + 1e-9

    cluster_sizes: dict[str, int] = {}
    fingerprints:  dict[str, list] = {}
    for k in range(n_clusters):
        mask = labels == k
        cluster_sizes[str(k)] = int(mask.sum())
        if not mask.any():
            fingerprints[str(k)] = []
            continue
        cmean = window_means[mask].mean(axis=0)
        z     = (cmean - global_mean) / global_std
        fingerprints[str(k)] = [
            {"feature": f, "z_score": round(float(z[i]), 4)}
            for i, f in enumerate(feat_cols)
        ]

    dt = DecisionTreeClassifier(max_depth=4, random_state=42)
    dt.fit(window_means, labels)
    tree_rules = export_text(dt, feature_names=list(feat_cols))
    importances = sorted(
        [
            {"feature": f, "importance": round(float(dt.feature_importances_[i]), 4)}
            for i, f in enumerate(feat_cols)
        ],
        key=lambda x: x["importance"],
        reverse=True,
    )

    return {
        "n_clusters":          n_clusters,
        "feature_cols":        feat_cols,
        "cluster_sizes":       cluster_sizes,
        "fingerprints":        fingerprints,
        "decision_tree_rules": tree_rules,
        "feature_importances": importances,
    }


# ── /representatives ──────────────────────────────────────────────────────────

@router.get("/representatives")
def get_representatives(cluster: int = Query(...), n: int = Query(5)) -> dict:
    """Return the n windows closest to the centroid of the given cluster."""
    _check_artifacts()
    cfg         = config_manager.load()
    window_size = cfg["window_size"]
    latents     = storage.load_latents()        # (N, latent_dim)
    labels      = storage.load_labels()         # (N,)
    valid_idx   = storage.load_valid_indices()  # (N,)
    km          = storage.load_kmeans()

    n_clusters = int(labels.max()) + 1
    if cluster < 0 or cluster >= n_clusters:
        raise HTTPException(400, f"cluster must be 0..{n_clusters - 1}")

    mask           = labels == cluster
    idx_in_cluster = np.where(mask)[0]
    if len(idx_in_cluster) == 0:
        return {"cluster": cluster, "windows": []}

    centroid = km.cluster_centers_[cluster]
    dists    = np.linalg.norm(latents[idx_in_cluster] - centroid, axis=1)
    top_n    = min(n, len(idx_in_cluster))
    order    = np.argsort(dists)[:top_n]

    df = _raw_df(cfg)

    windows_out = []
    for rank, pos in enumerate(order):
        wi  = int(idx_in_cluster[pos])
        row = int(valid_idx[wi])
        rows = df.iloc[row : row + window_size]
        ohlcv = [
            {
                "timestamp": str(r["timestamp"]),
                "open":  float(r["open"]),
                "high":  float(r["high"]),
                "low":   float(r["low"]),
                "close": float(r["close"]),
            }
            for _, r in rows.iterrows()
        ]
        windows_out.append({
            "rank":             rank,
            "dist_to_centroid": round(float(dists[order[rank]]), 4),
            "ohlcv":            ohlcv,
        })

    return {"cluster": cluster, "windows": windows_out}


# ── /forward-returns ──────────────────────────────────────────────────────────

@router.get("/forward-returns")
def get_forward_returns(horizon: int = Query(4)) -> dict:
    """Forward return distribution per cluster using non-overlapping windows."""
    _check_artifacts()
    cfg         = config_manager.load()
    window_size = cfg["window_size"]
    labels      = storage.load_labels()        # (N,)
    valid_idx   = storage.load_valid_indices() # (N,)
    n_clusters  = int(labels.max()) + 1

    df    = _raw_df(cfg)
    close = df["close"].to_numpy(dtype=np.float64)
    ts    = df["timestamp"].to_numpy()

    # Non-overlapping: sample every window_size steps to avoid autocorrelation
    sample_indices = np.arange(0, len(labels), window_size)

    per_cluster: dict[int, list[float]] = {k: [] for k in range(n_clusters)}

    for i in sample_indices:
        last_bar = int(valid_idx[i]) + window_size - 1
        fwd_bar  = last_bar + horizon
        if fwd_bar >= len(df):
            continue
        # Skip if the forward window spans an overnight/weekend gap
        gap_sec = (ts[fwd_bar] - ts[last_bar]) / np.timedelta64(1, "s")
        if gap_sec > horizon * 300 * 1.5:
            continue
        fwd_ret = float(close[fwd_bar] / close[last_bar]) - 1
        per_cluster[int(labels[i])].append(fwd_ret)

    n_non_overlapping = sum(len(v) for v in per_cluster.values())

    clusters_out: dict[str, dict] = {}
    for k in range(n_clusters):
        rets = per_cluster[k]
        if not rets:
            clusters_out[str(k)] = {"mean": 0.0, "median": 0.0, "p25": 0.0, "p75": 0.0, "hit_rate": 0.0, "n": 0}
            continue
        arr = np.array(rets)
        clusters_out[str(k)] = {
            "mean":     round(float(arr.mean()), 6),
            "median":   round(float(np.median(arr)), 6),
            "p25":      round(float(np.percentile(arr, 25)), 6),
            "p75":      round(float(np.percentile(arr, 75)), 6),
            "hit_rate": round(float((arr > 0).mean()), 4),
            "n":        len(rets),
        }

    return {
        "horizon":           horizon,
        "n_non_overlapping": n_non_overlapping,
        "clusters":          clusters_out,
    }
