#!/usr/bin/env python
"""
Profile a v2 model's training data by running it through the full v2 feature
engineering pipeline — identical to what the model was actually trained on.

Run from the project root:
    PYTHONPATH=src/v2/backend uv run .claude/skills/eval-training-config/scripts/profile_data.py <model_dir>

Outputs a JSON blob to stdout for Claude to reason over.
"""

import argparse
import json
import os
import sys

# Add v2 backend to path (script is always invoked from project root)
sys.path.insert(0, os.path.abspath("src/v2/backend"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("model_dir", help="Path to the model bundle directory (must contain meta.json)")
    args = ap.parse_args()

    meta_path = os.path.join(args.model_dir, "meta.json")
    if not os.path.exists(meta_path):
        print(json.dumps({"error": f"meta.json not found in {args.model_dir}"}))
        return 1

    with open(meta_path) as f:
        meta = json.load(f)

    symbol      = meta.get("symbol")
    timeframe   = meta.get("timeframe")
    window_size = meta.get("window_size", 64)
    test_split  = meta.get("test_split", 0.2)
    train_split = 1.0 - test_split
    batch_size  = meta.get("batch_size", 256)
    latent_dim  = meta.get("latent_dim", 32)

    try:
        from services import storage, config_manager
        import numpy as np
        import pandas as pd
        from sklearn.preprocessing import RobustScaler
    except ImportError as e:
        print(json.dumps({"error": f"Could not import v2 backend: {e}. Run from project root with PYTHONPATH=src/v2/backend"}))
        return 1

    report: dict = {
        "model_dir": args.model_dir,
        "symbol":    symbol,
        "timeframe": timeframe,
    }

    try:
        # ── 1. Load raw bars ──────────────────────────────────────────────────
        df_raw = storage.load_bars(symbol, timeframe)
        report["n_rows_raw"] = int(len(df_raw))

        # ── 2. Clean ──────────────────────────────────────────────────────────
        df = storage.clean_data(df_raw)

        # ── 3. Engineer features ──────────────────────────────────────────────
        df = storage.add_features(df)

        # ── 4. Drop NaN warmup rows ───────────────────────────────────────────
        df = storage.drop_feature_nans(df)
        report["n_rows_after_engineering"] = int(len(df))
        report["rows_lost_to_nan_warmup"]  = report["n_rows_raw"] - report["n_rows_after_engineering"]

        feat_cols = config_manager.feature_cols()
        report["n_features"]      = len(feat_cols)
        report["feature_columns"] = feat_cols

        # ── 5. Profile PRE-SCALE features ─────────────────────────────────────
        # Stats on the unscaled engineered features — scale ratio is meaningful here.
        num  = df[feat_cols]
        desc = num.describe().T
        report["feature_stats"] = {
            col: {
                "min":  round(float(desc.loc[col, "min"]),  6),
                "max":  round(float(desc.loc[col, "max"]),  6),
                "mean": round(float(desc.loc[col, "mean"]), 6),
                "std":  round(float(desc.loc[col, "std"]),  6),
            }
            for col in feat_cols
        }
        spreads = {col: float(desc.loc[col, "max"] - desc.loc[col, "min"]) for col in feat_cols}
        nz = {c: v for c, v in spreads.items() if v > 0}
        if nz:
            report["scale_ratio_max_to_min"] = round(max(nz.values()) / min(nz.values()), 1)
            report["widest_feature"]          = max(nz, key=nz.get)
            report["narrowest_feature"]       = min(nz, key=nz.get)

        # Null / duplicate check (should be empty after drop_feature_nans)
        nulls = df[feat_cols].isna().sum()
        report["null_counts"]    = {c: int(v) for c, v in nulls.items() if v > 0}
        report["duplicate_rows"] = int(df.duplicated().sum())

        # ── 6. Time column stats ──────────────────────────────────────────────
        ts = pd.to_datetime(df["timestamp"], errors="coerce").dropna().sort_values()
        report["time_range"]    = [str(ts.iloc[0]), str(ts.iloc[-1])]
        report["time_monotonic"] = bool(ts.is_monotonic_increasing)
        if len(ts) > 2:
            deltas = ts.diff().dropna()
            report["time_step_median"] = str(deltas.median())
            med = deltas.median()
            if med.total_seconds() > 0:
                report["large_time_gaps"] = int(len(deltas[deltas > med * 5]))

        # ── 7. Scale (fit on train portion only, matching training exactly) ───
        split_row = int(len(df) * train_split)
        scaler = RobustScaler().fit(df[feat_cols].iloc[:split_row])
        df[feat_cols] = scaler.transform(df[feat_cols])

        # ── 8. Window + gap filter ────────────────────────────────────────────
        X = storage.make_windows(df, feat_cols, window_size)
        X_clean, _ = storage.filter_gap_windows(X, df, window_size)

        n_total = int(len(X_clean))
        n_train = int(n_total * train_split)
        n_test  = n_total - n_train

        report["window_size"]     = window_size
        report["test_split"]      = test_split
        report["n_windows_total"] = n_total
        report["n_windows_train"] = n_train
        report["n_windows_test"]  = n_test

        # ── 9. Memory estimate for one training batch ─────────────────────────
        bytes_per_batch = batch_size * window_size * len(feat_cols) * 4  # float32
        report["approx_batch_mb"] = round(bytes_per_batch / 1_048_576, 2)
        report["batch_size"]      = batch_size
        report["latent_dim"]      = latent_dim

    except Exception as e:
        report["error"] = str(e)
        print(json.dumps(report, indent=2, default=str))
        return 1

    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
