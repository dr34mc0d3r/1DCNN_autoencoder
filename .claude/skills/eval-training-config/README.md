# eval-training-config Skill

## Purpose

Evaluates whether a trained model's hyperparameters and training configuration were appropriate for the data it was trained on, then recommends better settings if they weren't.

This is a **config appropriateness audit**, not a model quality audit. It answers: *"were these settings right for this data?"* — not *"is this a good model?"*. The distinction matters: you can answer the first question from the training metadata and the CSV alone; the second requires loading the model and running inference, which is out of scope here.

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
| Data quality | Are there nulls, duplicates, or ordering problems in the CSV? |
| Normalization | Is the feature scale ratio large enough to warrant checking the scaler? |

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
| `csv_path` | Project-relative path to the training CSV |
| `symbol`, `timeframe` | Fallback for deriving CSV path if `csv_path` is absent |
| `window_size`, `latent_dim`, `n_features` | Model architecture |
| `batch_size`, `initial_lr`, `final_lr` | Training settings |
| `scheduler`, `scheduler_params` | LR schedule type and active parameters |
| `epochs_attempted`, `epochs_trained`, `early_stop_reason` | Training outcome |
| `final_train_loss`, `final_val_loss`, `best_val_loss` | Loss metrics |
| `test_split` | Data split |
| `guard_*` (7 fields) | TrainingGuard configuration |

### Tool dependencies
- `uv` — must be available on PATH to run the profiler script
- `date` shell command — for report timestamp

### Bundled files (do not move or rename)
```
.claude/skills/eval-training-config/
  SKILL.md                          ← skill instructions (read by Claude)
  README.md                         ← this file
  references/
    stock_stack.md                  ← platform-specific priors loaded at step 0
  scripts/
    profile_data.py                 ← memory-frugal CSV profiler
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
3. Derives the CSV path from `meta.json` (asks only if the file can't be found)
4. Runs `scripts/profile_data.py` against the CSV to get a data profile
5. Works through an evaluation checklist comparing config vs data
6. Writes a timestamped markdown report into the model directory
7. Prints a short terminal summary (3–5 lines)

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

`scripts/profile_data.py` profiles the raw training CSV and returns JSON. It is memory-frugal by design — on files larger than 200k rows it loads an evenly-spaced sample rather than the full file, preserving the full time span at reduced density.

**Profiler outputs:**

| Field | Description |
|---|---|
| `n_rows_total` | True row count (line scan, not pandas) |
| `sampled`, `n_rows_loaded` | Whether stats come from full data or a sample |
| `columns`, `dtypes` | Column names and types |
| `null_counts`, `null_pct` | Per-column missingness |
| `duplicate_rows` | Count of duplicate rows |
| `numeric_summary` | min/max/mean/std per numeric column |
| `scale_ratio_max_to_min` | Ratio of largest to smallest feature spread — normalization smell test |
| `time_col`, `time_range` | Detected time column and date span |
| `time_monotonic` | Whether timestamps are in ascending order |
| `time_step_median` | Typical bar cadence |
| `large_time_gaps` | Count of gaps > 5× the median cadence |
| `target_*` | Target distribution / imbalance (only if a target column exists — absent for raw OHLCV CSVs) |

**Note:** The v2 training CSV is raw OHLCV with no target column, so `target_*` fields will be absent from the profile output. This is expected and correct for an unsupervised autoencoder.

---

## Platform context

The skill is tuned for the v2 stock-screener platform. `references/stock_stack.md` encodes:
- The `ConvAutoencoder` architecture (encoder/decoder, MSE reconstruction loss, no classification heads)
- 5-minute bar cadence and what that means for window budgets
- The 3.5GB RAM hard constraint on both dev machines
- The 27-feature set and normalization expectations
- Chronological split and gap-filter behaviour
- The 6-detector `TrainingGuard` and what each detector means
- Alpaca IEX data caveats (partial volume, possible gaps)

These priors are loaded at step 0 of every evaluation so recommendations are specific to this system, not generic time-series advice.
