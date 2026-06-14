# v2 Pipeline Warnings

Known data quality issues and intentional deviations from strict best practice.
Each entry records what was done, why, and what the trade-off is.

---

## W-001 — vol_return and trade_count_ratio clipped at 99th percentile

**File**: `src/v2/backend/services/storage.py` → `add_features()`  
**Added**: 2026-06-14

### What it does
After computing `vol_return` (volume pct_change) and `trade_count_ratio` (trade count
relative to 20-bar rolling mean), both columns are clipped to their 99th percentile:

```python
df["vol_return"]        = df["vol_return"].clip(upper=df["vol_return"].quantile(0.99))
df["trade_count_ratio"] = df["trade_count_ratio"].clip(upper=df["trade_count_ratio"].quantile(0.99))
```

### Why
Alpaca's free tier serves **IEX data**, which reports only a subset of consolidated
tape volume. This produces occasional extreme spikes — `vol_return` was observed at
**1836×** in TSLA 5-minute data (mean ≈ 1.9, std ≈ 28). After `RobustScaler`
transformation, a 1836× value becomes hundreds of standard deviations above the
median. Any training window containing that bar produces outsized gradients,
distorting the autoencoder's reconstruction loss and slowing convergence for
legitimate patterns.

Clipping at the 99th percentile caps these spikes while preserving normal volume
surge behaviour (real events like earnings or news tend to land at 5–20×, well
within the 99th percentile range).

### Trade-off: mild leakage
The clip threshold (`quantile(0.99)`) is computed on the **full DataFrame passed
to `add_features()`** — which during training includes both the train and test
splits. This means the test split's extreme volume bars influence the clip ceiling
by a tiny amount.

**Why it's acceptable here**: the 99th percentile of a volume-change distribution
is stable across splits for any reasonably large dataset (108K+ bars). The clip
is a hard cap on data quality artifacts, not a signal that carries predictive
information. Strict leakage prevention would compute the cap on the train split
only and apply it to test — the same way `RobustScaler` is handled — but the
implementation complexity isn't warranted for an artifact cap.

If this ever needs to be made leakage-free, move the clip into the train-only
scaling step in `run_pipeline()` (after the train/test split is known).

### Scope
Applies to all symbols and timeframes — not TSLA-specific. Any Alpaca IEX download
will have the same partial-volume artifact.
