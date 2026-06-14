# eval-training-config Skill

## Purpose

Evaluates whether a trained model's hyperparameters and training configuration were appropriate for the data it was trained on, then recommends better settings if they weren't.

This is a **config appropriateness audit**, not a model quality audit. It answers: *"were these settings right for this data?"* — not *"is this a good model?"*. The distinction matters: you can answer the first question from the training metadata and the data profile; the second requires loading the model and running inference, which is out of scope here.

Every recommendation is grounded in actual numbers from the data profile. The skill never suggests a setting change without tying it to a specific value from the config or the data.

---

## What it evaluates

| Area | What is checked |
|---|---|
| Window budget | Does `window_size` leave enough training windows after gap filtering? |
| Memory safety | Will `batch_size × window_size × n_features × latent_dim` fit in ~3.5GB RAM? |
| Leakage | Are splits chronological? Was the scaler fit on train-only data? |
| Convergence | Does the train/val loss gap indicate healthy training or over/underfitting? |
| Guard settings | Did early stopping fire — and was it the right reason, or too tight/loose? |
| Scheduler | Does the LR schedule suit the batch size and epoch budget? |
| Data quality | Are there nulls, duplicates, or ordering problems after feature engineering? |
| Normalization | Is the pre-scale feature spread ratio large enough to warrant scrutiny? |

---

## What it does NOT evaluate

- The quality of the learned representations (weights in `model.pt`)
- Reconstruction error on specific windows
- Latent space cluster separation
- Inference behaviour on live data

These require loading and running the model. Use the v2 app's Windows, Latent Space, and Analysis pages for those.

---

## Requirements

### To invoke
- A model directory path, e.g. `src/v2/backend/models/TSLA5Min_LR_Exponential_Decay`
- That directory must contain a `meta.json` written by the v2 training pipeline

### What meta.json must contain
The v2 app writes this automatically at training completion. Required fields:

| Field | Source |
|---|---|
| `symbol`, `timeframe` | Used to load the correct CSV via the v2 pipeline |
| `window_size`, `latent_dim`, `n_features` | Model architecture |
| `batch_size`, `initial_lr`, `final_lr` | Training settings |
| `scheduler`, `scheduler_params` | LR schedule type and active parameters |
| `epochs_attempted`, `epochs_trained`, `early_stop_reason` | Training outcome |
| `final_train_loss`, `final_val_loss`, `best_val_loss` | Loss metrics |
| `test_split` | Data split ratio |
| `guard_*` (7 fields) | TrainingGuard configuration |

### Tool dependencies
- `uv` — must be available on PATH to run the profiler script
- `date` shell command — for report timestamp
- v2 backend importable via `PYTHONPATH=src/v2/backend`

### Bundled files (do not move or rename)
```
.claude/skills/eval-training-config/
  SKILL.md                          ← skill instructions (read by Claude)
  README.md                         ← this file
  references/
    stock_stack.md                  ← platform-specific priors loaded at step 0
  scripts/
    profile_data.py                 ← v2 pipeline profiler
```

---

## How to use

### Trigger automatically
Claude will invoke this skill automatically when you use words like "evaluate", "review", "check", "tune", or "suggest settings for" alongside a model path:

> *"evaluate the config in src/v2/backend/models/TSLA5Min_LR_Exponential_Decay"*
> *"are these hyperparameters right for this data?"*
> *"review the training settings for my last model"*

### Invoke explicitly
```
/eval-training-config src/v2/backend/models/TSLA5Min_LR_Exponential_Decay
```

### What Claude does
1. Loads platform priors from `references/stock_stack.md`
2. Reads `meta.json` from the model directory
3. Runs `scripts/profile_data.py <model_dir>` — this runs the full v2 pipeline and returns a JSON profile of the engineered feature space
4. Works through an evaluation checklist comparing config vs data
5. Writes a timestamped markdown report into the model directory
6. Prints a short terminal summary (3–5 lines)

---

## Outputs

### 1. Report file
Written to the model directory as:
```
src/v2/backend/models/<model-name>/eval_YYYY-MM-DD_HHMMSS.md
```

Report sections:
- **Current settings** — table of all config values found, with any absent fields noted
- **Suggested settings for this data** — each change stated as `current → suggested → why`, tied to a specific data or config fact
- **What to watch after retraining** — concrete signals to look for (loss gap, guard trigger, gradient behaviour, cluster separation)
- **Other notes** — data quality issues, leakage risks, memory headroom
- **Data profile (raw)** — the full profiler JSON for traceability

### 2. Terminal summary
A 3–5 line print after the report is written:
- Path to the report file
- Top 2–3 recommended changes
- The single most important thing to watch

---

## The profiler script

`scripts/profile_data.py` runs the training CSV through the **full v2 feature engineering pipeline** — the same steps the model was actually trained on — and returns a JSON profile of the result.

**What the pipeline runs:**
1. `load_bars(symbol, timeframe)` — load raw OHLCV from CSV
2. `clean_data()` — drop duplicates and nulls
3. `add_features()` — engineer all 27 features
4. `drop_feature_nans()` — remove rolling-window warmup rows
5. **Profile here** — stats on the 27-feature DataFrame, pre-scale
6. `scale_features()` — RobustScaler fit on train portion only
7. `make_windows()` — sliding windows of shape `(N, window_size, n_features)`
8. `filter_gap_windows()` — remove windows spanning overnight/weekend gaps
9. **Report window counts** — exact train/test split counts

This means every number in the profile reflects what the model actually saw — not the raw OHLCV input.

**Profiler JSON fields:**

| Field | Description |
|---|---|
| `n_rows_raw` | Row count in the original CSV |
| `n_rows_after_engineering` | Rows remaining after feature NaN warmup is dropped |
| `rows_lost_to_nan_warmup` | Rows removed by rolling-window NaN drop |
| `n_features`, `feature_columns` | The 27 engineered features fed to the model |
| `feature_stats` | Per-feature min/max/mean/std (pre-scale) |
| `scale_ratio_max_to_min` | Spread ratio of widest to narrowest feature — pre-scale |
| `widest_feature`, `narrowest_feature` | Which features define the extremes |
| `null_counts` | Any remaining nulls (should be empty after pipeline) |
| `duplicate_rows` | Duplicate row count |
| `time_range` | First and last timestamp after engineering |
| `time_monotonic` | Whether timestamps are in order |
| `time_step_median` | Typical bar cadence |
| `large_time_gaps` | Gaps > 5× the median cadence (overnight/weekend) |
| `n_windows_total` | Total windows after gap filtering |
| `n_windows_train` | Training windows (chronological first portion) |
| `n_windows_test` | Test windows (chronological last portion) |
| `approx_batch_mb` | Approximate memory for one training batch (float32) |

---

## Platform context

The skill is tuned exclusively for the v2 stock-screener platform. `references/stock_stack.md` encodes:
- The `ConvAutoencoder` architecture (encoder/decoder, MSE reconstruction loss, no classification heads)
- 5-minute bar cadence and what that means for window budgets
- The 3.5GB RAM hard constraint on both dev machines
- The 27-feature set and their pre-scale characteristics
- Chronological split and gap-filter behaviour
- The 6-detector `TrainingGuard` and what each detector means
- Alpaca IEX data caveats (partial volume, possible gaps)

These priors are loaded at step 0 of every evaluation so recommendations are specific to this system, not generic time-series advice.
