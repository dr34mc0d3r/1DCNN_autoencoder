---
name: eval-training-config
description: >
  Evaluate a trained model's training settings/hyperparameters against the dataset
  it was (or will be) trained on, and recommend better settings for that data. Use
  this whenever the user points at a model directory and a training CSV and asks to
  "evaluate", "review", "check", "tune", or "suggest settings for" a model or its
  config — e.g. "run evaluate on path/to/model" or "are these hyperparameters right
  for this data?". Triggers even when the user doesn't say the word "skill". Produces
  a dated markdown report in the model directory. Especially relevant for time-series
  / OHLCV models and memory-constrained training (~3.5GB RAM machines).

  see https://claude.ai/chat/58932b84-68bd-4a52-bd55-fd55eb0e5d5d for initial design discussion and https://claude.ai/chat/1b9c8a0e-5c3d-4c7b-9a1e-8f2c9e5f6a7e for a sample report.
---

# Evaluate Training Config

Given (1) a **model directory** containing the settings/config used to build a model
and (2) a path to the **training data CSV**, evaluate whether the current settings
suit the data, recommend better settings, and write a timestamped markdown report
into the model directory.

The real work here is *reasoning*, not computation — but ground every recommendation
in actual numbers from the data using the bundled profiler. Never suggest a setting
without tying it to something concrete in the config or the data profile.

## Inputs

The user provides a model directory and a CSV path. If either is missing, ask once.
- **Model dir**: contains config files — any of `*.yaml`, `*.yml`, `*.json`, `*.toml`,
  `config.py`, `hyperparameters.*`, `args.*`, `train.py`, `*.txt`, checkpoints, logs.
- **Data CSV**: the dataset used (or to be used) for training.

## Procedure

### 0. Load platform priors
Read `.claude/skills/eval-training-config/references/stock_stack.md` before doing
anything else. It encodes the house architecture, memory constraints, data cadence,
and per-head evaluation priorities for this platform. All recommendations should be
tuned against those priors, not generic time-series advice.

### 1. Read the current settings
List the model directory and read every plausible config/settings file. Extract the
training-relevant knobs into a normalized picture. Look specifically for:
- sequence/window length, stride, horizon
- batch size, hidden dim(s), number of layers, dropout
- learning rate, optimizer, weight decay, epochs, early-stopping/patience
- train/val/test split definition (ratios or dates), and whether splitting is
  chronological vs shuffled
- normalization/scaling strategy and where it's fit
- loss function(s); for multi-task models, the per-head loss weights
- model family (LSTM / TCN / etc.) and any class-weighting/sampling

If a setting can't be found, say so explicitly rather than guessing — an *absent*
setting (e.g. no early stopping, no class weighting) is itself a finding.

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
  windows does the current `seq_len`/stride actually yield? Is it enough for the
  train split alone? Flag if seq_len is large relative to available rows.
- **Time-series leakage** (high priority) — splits must be **chronological**, not
  shuffled. Scaler/normalizer stats must be fit on **train only**, never the full
  series. Any feature using future information (look-ahead) is leakage. If
  `time_monotonic` is false, flag it. Check split dates fall inside `time_range`.
- **Class imbalance** — if `target_imbalance_ratio` is high (say > ~3:1), the current
  loss/sampling probably needs class weighting, focal loss, or resampling; plain
  accuracy will be misleading. Recommend a metric (macro-F1, balanced accuracy).
- **Normalization** — a large `scale_ratio_max_to_min` (e.g. volume vs price) means
  unscaled features will dominate; recommend per-feature scaling fit on train.
- **Memory feasibility (~3.5GB RAM)** — sanity-check `batch_size × seq_len ×
  n_features × hidden_dim`. If it's likely to OOM on a 3.5GB box, recommend smaller
  batches, gradient accumulation, smaller hidden dims, or precomputed features. Treat
  RAM as a hard constraint, not a nice-to-have.
- **Learning rate / epochs / early stopping** — does LR suit batch size? Is there
  early stopping with patience? Are epochs reasonable for the window count?
- **Missing/duplicate data** — non-trivial null % or duplicates should be addressed
  before training; note imputation/dedup needs.
- **Multi-task balance** (if applicable) — are per-head loss weights set deliberately,
  or will one head dominate? Tie suggestions to the target stats per head if present.

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
<concrete signals: train/val loss gap, per-head metric movement, whether early
stopping fires, NaN/exploding gradients, calibration, the metric to trust given
imbalance — and what each would mean>

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
