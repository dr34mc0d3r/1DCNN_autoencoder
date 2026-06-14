# Stock Platform — Stack Defaults & Evaluation Priors

Read this when the model under evaluation belongs to the v2 stock-screener platform.
It encodes the house architecture and constraints so recommendations are tuned to
*this* system rather than generic time-series advice. Treat these as the expected
defaults; flag deviations, but don't assume the user is wrong — ask if a deviation
looks intentional.

## Contents
1. Architecture
2. Data shape & window budget (5-minute bars)
3. Memory budget (~3.5GB RAM) — hard constraint
4. Features & normalization
5. Splits & leakage (time-series specific)
6. Training guard — 6 failure detectors
7. Alpaca free-tier data caveats

---

## 1. Architecture

- **Model**: `ConvAutoencoder` — a symmetric 1D convolutional encoder/decoder.
  - **Encoder**: Conv1d layers compress `(batch, n_features, window_size)` down
    to a latent vector of size `latent_dim`.
  - **Decoder**: ConvTranspose1d layers reconstruct the original window.
  - **Loss**: MSE reconstruction loss (single task — no classification heads).
  - **Optimizer**: Adam.
- **Purpose**: unsupervised anomaly / pattern detection via reconstruction error.
  High reconstruction error = unusual / anomalous window. Latent vectors are
  clustered with K-Means (optional post-training step) to find regime groups.
- **No direction / magnitude / volatility / confidence heads** — this is a pure
  autoencoder, not a multi-task predictor. Evaluation metrics are reconstruction
  loss and latent-space cluster quality, not classification accuracy or F1.

## 2. Data shape & window budget (5-minute bars)

- The platform currently uses **5-minute bars** (configurable via `timeframe`).
- US regular session ≈ 6.5h → **78 bars per trading day**, ~252 days/year →
  **~19,600 bars per symbol per year**.
- The training CSV (`src/v2/backend/downloads/{symbol}/{timeframe}.csv`) has raw
  OHLCV columns: `timestamp, open, high, low, close, volume, vwap, trade_count`.
  Feature engineering adds 19 derived columns (see §4) → **27 total features**.
- Gap filtering removes windows that span overnight/weekend gaps (default gap
  threshold: 300 seconds). The actual window count after gap filtering will be
  lower than `(n_rows - window_size + 1)` — check `meta.json` for actual counts
  or re-run the pipeline to measure.
- Rough `window_size` anchors at 5-min cadence: **48 ≈ 4h**, **78 ≈ 1 trading
  day**, **390 ≈ 1 week**. A large `window_size` on sparse data leaves few
  independent windows — flag it.

## 3. Memory budget (~3.5GB RAM) — hard constraint

Both dev machines have ~3.5GB RAM. OOM-avoidance is non-negotiable.
- Favor **small batch sizes** (32–128) and **modest latent dims** (16–64).
- Rough feasibility check: `batch_size × window_size × n_features × 4 bytes`
  for one batch tensor, then multiply ~3–4× for activations + optimizer state.
  If that approaches a meaningful fraction of 3.5GB before OS/Python overhead,
  it's too big.
- Prefer precomputed/cached features on disk over recomputing per epoch.
  The pipeline already does this (CSV → features → scale → windows in one pass
  before training begins).

## 4. Features & normalization

**27 features** (8 raw + 19 engineered):

| Group | Columns |
|---|---|
| Raw OHLCV | open, high, low, close, volume, vwap, trade_count |
| Trend | ema_9, ema_21, ema_50 |
| MACD | macd, macd_9, macd_hist |
| Candle structure | body, upper_wick, lower_wick, candle_efficiency |
| Returns & volume | return, vol_return, log_return, volume_ratio, trade_count_ratio |
| Volatility | atr_14, rolling_vol |
| Bollinger | bb_width, bb_pct |
| VWAP | vwap_dev |
| RSI | rsi_14 |
| Stochastic | stoch_k, stoch_d |
| Time | hour_sin, hour_cos |

**Scaling**: `RobustScaler` fitted on the **train split only** (correct — no
leakage). Raw price vs. volume differs by ~10^4–10^5×; the scaler handles this,
but a large `scale_ratio_max_to_min` from the profiler still confirms the need
for it. The saved `scaler.pkl` is the fitted instance.

## 5. Splits & leakage (time-series specific) — high priority

- Split is **chronological by index** (`test_split` fraction held out from the
  end). Not shuffled — correct.
- Scaler is fit on `train_split` rows only — correct.
- **Gap filter** removes windows spanning overnight gaps, which prevents the
  model from learning spurious overnight-gap patterns. Check the gap threshold
  (default 300s) matches the data cadence.
- Labels: this is an **unsupervised** model — there are no forward-looking labels,
  so label leakage is not a concern. Feature leakage (look-ahead in indicators)
  could still apply: all indicators use only past/same-bar data (EWM, rolling),
  so the current implementation is clean.
- If `time_monotonic: false` in the profiler output, treat ordering as broken.

## 6. Training guard — 6 failure detectors

The `TrainingGuard` stops training early on any of:

| Detector | Config key | Meaning |
|---|---|---|
| NaN/Inf | — | Weights exploded |
| Loss explosion | `guard_explosion_factor` | Loss > initial × factor |
| Reconstruction collapse | `guard_collapse_threshold` | Loss < threshold (decoder outputs mean) |
| Overfitting | `guard_overfit_ratio` | val/train ratio > threshold |
| Plateau | `guard_patience`, `guard_min_delta` | No val improvement for N epochs |
| Oscillation | `guard_oscillation_window`, `guard_oscillation_cv` | CV of recent losses > threshold |

`early_stop_reason` in `meta.json` records which detector fired and at which
epoch. If `early_stop_reason` is `"completed"`, all epochs ran without guard
triggering. Evaluate the guard settings against training behavior: very tight
patience on sparse data = premature stop; very loose oscillation CV = noisy LR
not caught.

## 7. Alpaca free-tier data caveats

- Free tier serves **IEX** data, not full consolidated SIP — **volume is partial**
  and liquidity looks thinner than reality.
- Expect rate limits and occasional gaps in history. Low-volume or gap findings
  from the profiler may be Alpaca artifacts rather than real data problems — note
  this rather than treating it as a defect to fix.
- `trade_count` is also IEX-partial; `volume_ratio` and `trade_count_ratio`
  features derived from it will have the same artifact.
