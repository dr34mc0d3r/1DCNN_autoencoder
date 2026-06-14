# Stock Platform — Stack Defaults & Evaluation Priors

Read this when the model under evaluation belongs to the tiered stock-screener
platform. It encodes the house architecture and constraints so recommendations are
tuned to *this* system rather than generic time-series advice. Treat these as the
expected defaults; flag deviations, but don't assume the user is wrong — ask if a
deviation looks intentional.

## Contents
1. Architecture
2. Data shape & window budget (1-hour bars)
3. Memory budget (~3.5GB RAM) — hard constraint
4. Features, sentiment & normalization
5. Splits & leakage (time-series specific)
6. Per-head evaluation priorities
7. Alpaca free-tier data caveats

---

## 1. Architecture
- **Multi-task network**: a shared **LSTM/TCN trunk** feeding **four heads**:
  - **Direction** — classification (e.g. up / flat / down). Imbalance-prone.
  - **Magnitude** — regression on return size.
  - **Volatility** — regression (targets often derived from Parkinson volatility).
  - **Confidence** — calibration-critical; this head feeds the **Edge-tier AI signal
    explainer** that paying users see, so a confidently-wrong output is worse for the
    product than an honestly-uncertain one.
- **Per-head loss weighting is a first-class setting.** If weights are absent or all
  equal, check whether one head's loss scale dominates (regression MSE on raw returns
  can swamp a cross-entropy term). Recommend explicit weights or loss normalization.
- Monorepo with a shared `core/` module; configs may import shared defaults rather
  than restating them — look in `core/` if a setting seems missing from the model dir.

## 2. Data shape & window budget (1-hour bars)
- The platform standardized on **1-hour bars** (chosen over 15-min because news/
  sentiment density is too sparse at 15-min). Implication: **fewer rows than a 15-min
  model**, so the window budget is tighter — check it explicitly.
- US regular session ≈ 6.5h → roughly **6–7 bars per trading day**, ~252 trading days/
  year → **~1,600–1,800 bars per symbol per year**. Use this to sanity-check how many
  training windows a given `seq_len` actually yields.
- Rough `seq_len` anchors at 1h cadence: **48 ≈ ~7 trading days**, **96 ≈ ~2 weeks**,
  **240 ≈ ~5–6 weeks**. A large `seq_len` on a single year of one symbol leaves very
  few independent windows — flag it and suggest more history or multi-symbol pooling.

## 3. Memory budget (~3.5GB RAM) — hard constraint
Both dev machines have ~3.5GB RAM. Treat OOM-avoidance as non-negotiable.
- **Precompute FinBERT sentiment offline.** The transformer (`ProsusAI/finbert`) must
  **never** be loaded during training — sentiment should already be a column in the
  CSV. If the profiler shows no sentiment feature, that's a finding.
- Favor **small batch sizes**, **modest hidden dims** (think tens to low hundreds, not
  512+), and **gradient accumulation** instead of large batches.
- Rough feasibility check: `batch_size × seq_len × n_features × hidden_dim × 4 bytes`,
  then multiply for activations/optimizer state (a ~3–4× buffer is sane). If that
  approaches a meaningful fraction of 3.5GB *before* OS/Python overhead, it's too big.
- Prefer precomputed/cached features on disk over recomputing per epoch.

## 4. Features, sentiment & normalization
- Likely feature set includes OHLCV plus custom indicators from the dashboard:
  **Parkinson volatility, VWAP Z-score, money-flow ratio, acceleration**. These live
  on very different scales — raw **price vs volume can differ by ~10^5–10^6×**, which
  unscaled will let volume dominate the trunk. A large `scale_ratio_max_to_min` from
  the profiler confirms this.
- Recommend **per-feature scaling fit on the train split only**. Consider modeling
  **returns rather than raw price levels**, and **log-transforming volume**. VWAP
  Z-score is already roughly standardized; Parkinson vol is small-positive; money-flow
  ratio is bounded-ish; acceleration is noisy — note these when judging scaling.
- **Sentiment is sparse at 1h.** Many bars have no fresh news. Check how gaps are
  filled: forward-filling the *most recent past* sentiment is acceptable; pulling in
  sentiment timestamped after the bar is **leakage**.

## 5. Splits & leakage (time-series specific) — high priority
- Splits must be **chronological**, never shuffled. Scalers/normalizers fit on **train
  only**.
- **Embargo/purge gap.** Because windows span multiple bars *and* labels look forward
  (Direction/Magnitude derived from future returns), a naive chronological cut still
  leaks at the boundary: the last train window's label horizon bleeds into validation,
  and the first val window's features overlap train bars. Recommend an **embargo gap of
  at least `seq_len + label_horizon` bars** between splits (purged split).
- Verify the label horizon does **not** overlap the feature window, and that every
  indicator is computed from **past bars only**.
- If the profiler reports `time_monotonic: false`, treat ordering as broken until fixed.

## 6. Per-head evaluation priorities
- **Direction**: with a high `target_imbalance_ratio`, plain accuracy misleads.
  Recommend class weighting / focal loss / resampling and report **macro-F1 or balanced
  accuracy**.
- **Magnitude / Volatility**: report scale-aware error (MAE/RMSE in return units, or
  MAPE), not raw loss alone. Watch for the regression losses dominating the joint loss.
- **Confidence**: prioritize **calibration** — reliability diagram / ECE, not just
  accuracy. This is the head whose output users read in the Edge tier.

## 7. Alpaca free-tier data caveats
- Free tier serves **IEX** data, not full consolidated SIP — so **volume is partial**
  and liquidity looks thinner than reality. Low-volume or gap findings from the
  profiler may be Alpaca artifacts rather than real data problems; note this rather
  than treating it as a defect to "fix."
- Expect rate limits and occasional gaps in history; mind these when judging coverage.