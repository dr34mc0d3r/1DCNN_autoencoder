#!/usr/bin/env python
# /// script
# requires-python = ">=3.10"
# dependencies = ["pandas", "numpy"]
# ///


# run with prompt:
# evaluate the config in ./models/lstm_v3 against data/AAPL_1h.csv
"""
Profile a training CSV and emit a compact JSON summary on stdout.

Usage:
    uv run scripts/profile_data.py /path/to/data.csv [--target COL] [--time COL] [--sample N]

The output is meant to be read back by Claude, which reasons over it to
evaluate model-training settings. It is deliberately memory-frugal: on a
machine with ~3.5GB RAM, large CSVs are sampled rather than fully loaded.
"""
import argparse
import json
import sys

import numpy as np
import pandas as pd


def human_bytes(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(n) < 1024.0:
            return f"{n:.1f}{unit}"
        n /= 1024.0
    return f"{n:.1f}PB"


def count_rows(path: str) -> int:
    # Count lines without loading the file into memory; subtract header.
    total = 0
    with open(path, "rb") as f:
        for _ in f:
            total += 1
    return max(total - 1, 0)


def guess_time_col(df: pd.DataFrame) -> str | None:
    candidates = [c for c in df.columns
                  if any(k in c.lower() for k in ("time", "date", "timestamp", "dt"))]
    for c in candidates:
        try:
            pd.to_datetime(df[c], errors="raise")
            return c
        except Exception:
            continue
    return None


def guess_target_col(df: pd.DataFrame) -> str | None:
    for c in df.columns:
        if c.lower() in ("target", "label", "y", "signal", "direction", "class"):
            return c
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--target", default=None, help="target/label column name")
    ap.add_argument("--time", default=None, help="datetime/index column name")
    ap.add_argument("--sample", type=int, default=200_000,
                    help="max rows to load for stats (full row count is still reported)")
    args = ap.parse_args()

    report: dict = {"path": args.csv}

    try:
        n_rows = count_rows(args.csv)
    except Exception as e:
        print(json.dumps({"error": f"could not read file: {e}"}))
        return 1
    report["n_rows_total"] = n_rows

    # Memory-frugal load: if the file is large, take an evenly spaced sample so
    # we still see the whole time span rather than just the head.
    read_kwargs = {}
    sampled = False
    if n_rows > args.sample:
        sampled = True
        step = max(n_rows // args.sample, 1)
        skip = lambda i: i != 0 and (i % step != 0)  # noqa: E731
        read_kwargs["skiprows"] = skip

    try:
        df = pd.read_csv(args.csv, **read_kwargs)
    except Exception as e:
        print(json.dumps({"error": f"pandas failed to parse: {e}",
                          "n_rows_total": n_rows}))
        return 1

    report["sampled"] = sampled
    report["n_rows_loaded"] = int(len(df))
    report["n_columns"] = int(df.shape[1])
    report["columns"] = list(map(str, df.columns))
    report["dtypes"] = {str(c): str(t) for c, t in df.dtypes.items()}
    report["approx_memory_full_df"] = human_bytes(
        df.memory_usage(deep=True).sum() * (n_rows / max(len(df), 1))
    )

    # Missingness and duplicates
    nulls = df.isna().sum()
    report["null_counts"] = {str(c): int(v) for c, v in nulls.items() if v > 0}
    report["null_pct"] = {str(c): round(100 * v / max(len(df), 1), 3)
                          for c, v in nulls.items() if v > 0}
    report["duplicate_rows"] = int(df.duplicated().sum())

    # Numeric summary (kept terse)
    num = df.select_dtypes(include=[np.number])
    if not num.empty:
        desc = num.describe().T
        report["numeric_summary"] = {
            str(c): {
                "min": float(desc.loc[c, "min"]),
                "max": float(desc.loc[c, "max"]),
                "mean": float(desc.loc[c, "mean"]),
                "std": float(desc.loc[c, "std"]),
            }
            for c in desc.index
        }
        # Flag features on wildly different scales (normalization smell test)
        spreads = {c: float(desc.loc[c, "max"] - desc.loc[c, "min"]) for c in desc.index}
        nz = {c: v for c, v in spreads.items() if v > 0}
        if nz:
            report["scale_ratio_max_to_min"] = round(max(nz.values()) / min(nz.values()), 1)

    # Time column analysis
    time_col = args.time or guess_time_col(df)
    if time_col and time_col in df.columns:
        try:
            ts = pd.to_datetime(df[time_col], errors="coerce").dropna().sort_values()
            report["time_col"] = time_col
            report["time_range"] = [str(ts.iloc[0]), str(ts.iloc[-1])]
            report["time_monotonic"] = bool(ts.is_monotonic_increasing)
            if len(ts) > 2:
                deltas = ts.diff().dropna()
                report["time_step_median"] = str(deltas.median())
                # Gaps notably larger than the typical cadence
                med = deltas.median()
                if med.total_seconds() > 0:
                    big = deltas[deltas > med * 5]
                    report["large_time_gaps"] = int(len(big))
        except Exception as e:
            report["time_col_error"] = str(e)

    # Target column analysis
    target_col = args.target or guess_target_col(df)
    if target_col and target_col in df.columns:
        report["target_col"] = target_col
        s = df[target_col]
        nunique = int(s.nunique(dropna=True))
        report["target_nunique"] = nunique
        if nunique <= 20:  # treat as classification target
            vc = s.value_counts(dropna=False)
            report["target_distribution"] = {str(k): int(v) for k, v in vc.items()}
            counts = vc.values
            if len(counts) > 1 and counts.min() > 0:
                report["target_imbalance_ratio"] = round(float(counts.max() / counts.min()), 2)
        else:  # regression-style target
            report["target_regression_stats"] = {
                "min": float(s.min()), "max": float(s.max()),
                "mean": float(s.mean()), "std": float(s.std()),
            }

    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())