---
name: eval-training-config
description: >
  Evaluate a trained model's training settings/hyperparameters against the dataset
  it was (or will be) trained on, and recommend better settings for that data. Use
  this whenever the user points at a model directory and asks to
  "evaluate", "review", "check", "tune", or "suggest settings for" a model or its
  config — e.g. "run evaluate on path/to/model" or "are these hyperparameters right
  for this data?". Triggers even when the user doesn't say the word "skill". Produces
  a dated markdown report in the model directory. Especially relevant for time-series
  / OHLCV models and memory-constrained training (~3.5GB RAM machines).

  see https://claude.ai/chat/58932b84-68bd-4a52-bd55-fd55eb0e5d5d for initial design discussion and https://claude.ai/chat/1b9c8a0e-5c3d-4c7b-9a1e-8f2c9e5f6a7e for a sample report.
---

# Evaluate Training Config

Given a **model directory**, evaluate whether the training settings suit the data,
recommend better settings, and write a timestamped markdown report into the model
directory.

The real work here is *reasoning*, not computation — but ground every recommendation
in actual numbers from the data using the bundled profiler. Never suggest a setting
without tying it to something concrete in the config or the data profile.

## Inputs

The user provides a **model directory** (e.g. `src/v2/backend/models/TSLA5Min_LR_Exp`).
If it is missing, ask once.

The CSV path is read from `meta.json` (`csv_path` field) — do **not** ask the user
for it. If `meta.json` is absent or `csv_path` is missing, fall back to the
convention `src/v2/backend/downloads/{symbol}/{timeframe}.csv` using `symbol` and
`timeframe` from the same file. Only ask the user for the CSV if neither source
resolves to an existing file.

## Procedure

### 0. Load platform priors
Read `.claude/skills/eval-training-config/references/stock_stack.md` before doing
anything else. It encodes the house architecture, memory constraints, data cadence,
and per-head evaluation priorities for this platform. All recommendations should be
tuned against those priors, not generic time-series advice.

### 1. Read the current settings
The primary source is **`meta.json`** in the model directory — read it first. For
v2 models it contains every training knob in a single flat JSON. Extract:
- `window_size`, `latent_dim`, `n_features`, `feature_columns`
- `batch_size`, `initial_lr`, `final_lr`, `scheduler`, `scheduler_params`
- `epochs_attempted`, `epochs_trained`, `early_stop_reason`
- `final_train_loss`, `final_val_loss`, `best_val_loss`
- `test_split`, `csv_path`
- `guard_*` fields (patience, min_delta, overfit_ratio, explosion_factor,
  oscillation_window, oscillation_cv, collapse_threshold)

If `meta.json` is absent or fields are missing, fall back to any other config
files in the directory (`*.json`, `*.yaml`, `*.toml`, `config.py`). An *absent*
setting (e.g. no early stopping recorded) is itself a finding — say so explicitly.

### 2. Profile the data
Run the bundled profiler (uses `uv`, frugal on memory by sampling large files):

```bash
uv run .claude/skills/eval-training-config/scripts/profile_data.py <CSV_PATH>
# optional hints if auto-detection misses:
#   --target <col> --time <col>
```

It returns JSON: row count, columns/dtypes, missingness, duplicates, numeric ranges,
a feature-scale ratio, time column range/cadence/gaps, and target distribution +
imbalance ratio. Read the whole JSON before reasoning.

### 3. Evaluate config against data
Work through this checklist, comparing each current setting to what the data implies:

- **Window vs data length** — given `n_rows_total` and the cadence, how many training
  windows does the current `window_size` actually yield after gap filtering? Is it
  enough for the train split alone? Flag if `window_size` is large relative to
  available rows.
- **Time-series leakage** (high priority) — splits must be **chronological**, not
  shuffled. Scaler/normalizer stats must be fit on **train only**, never the full
  series. Any feature using future information (look-ahead) is leakage. If
  `time_monotonic` is false, flag it. Check split dates fall inside `time_range`.
- **Normalization** — a large `scale_ratio_max_to_min` (e.g. volume vs price) means
  unscaled features will dominate; recommend per-feature scaling fit on train.
- **Memory feasibility (~3.5GB RAM)** — sanity-check `batch_size × window_size ×
  n_features × latent_dim`. If it's likely to OOM on a 3.5GB box, recommend smaller
  batches, gradient accumulation, smaller latent dims, or precomputed features. Treat
  RAM as a hard constraint, not a nice-to-have.
- **Learning rate / scheduler / guard** — does the LR and scheduler suit the window
  count and batch size? Are the guard thresholds appropriate (patience, oscillation CV,
  overfit ratio)? Did early stopping fire very early — was a guard setting too tight?
- **Reconstruction loss trend** — is `final_train_loss` vs `best_val_loss` a healthy
  gap (slight overfit is expected) or a large one (guard too loose, or too few epochs)?
- **Missing/duplicate data** — non-trivial null % or duplicates should be addressed
  before training; note imputation/dedup needs.

### 4. Decide recommendations
For each setting you'd change, state: current value → suggested value → the specific
data/config fact driving it. Prefer a small number of high-impact changes over a long
list. If a current setting is already good, say so and leave it.

### 5. Write the report
Create a markdown file in the **model directory** named with a timestamp:

```
eval_YYYY-MM-DD_HHMMSS.md
```

Get the timestamp with `date +%Y-%m-%d_%H%M%S`. Use this structure:

```markdown
# Training Config Evaluation — <model name/dir>
_Generated: <ISO datetime>_
_Data: <csv path> (<n_rows_total> rows, <time_range>)_

## Current settings
<the settings you found, as a table or list; note any that were absent>

## Suggested settings for this data
<recommended changes: current → suggested → why, tied to the data profile>

## What to watch after training on the new settings
<concrete signals: train/val reconstruction loss gap, whether early stopping fires
and which guard triggered, NaN/exploding gradients, latent-space cluster separation
if K-Means is run — and what each signal would mean>

## Other notes
<data quality fixes, leakage risks, memory headroom, anything else relevant>

## Data profile (raw)
<the profiler JSON, for traceability>
```

### 6. Report back
After writing, print a 3–5 line terminal summary: the file path, the top 2–3
recommended changes, and the single most important thing to watch. Don't dump the
whole report into the terminal — it's in the file.

## Notes
- Be honest about uncertainty. If the config format is unfamiliar or a setting's
  meaning is ambiguous, say what you assumed.
- This is decision-support, not a guarantee — frame suggested settings as a starting
  point to validate empirically, not as proven-optimal values.
