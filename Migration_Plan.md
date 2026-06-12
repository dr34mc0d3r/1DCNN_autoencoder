# Migration Plan — 1DCNN_A v1 → v2

## Overview

This document maps every component of the existing v1 system (`src/1DCNN_A/` + `src/alpaca_api/`) to the new `src/v2/` architecture defined in `Migration_Notes.md`. It identifies what should be reimplemented, redesigned, simplified, or omitted, and specifies where each piece lands in the new directory structure.

The v2 application is a full client/server system: **React frontend → FastAPI backend → PyTorch engine**, with WebSocket streaming for live progress. Every notebook-based workflow is replaced by a browser page.

---

## v1 Component Inventory

### Python Modules (`src/1DCNN_A/`)

| Component | Purpose |
|-----------|---------|
| `config.py` | `Config` dataclass — 40+ hyperparameters (symbol, timeframe, window size, latent dim, epochs, guard thresholds, etc.) |
| `data.py` | Full data pipeline: load CSV → clean → engineer 14 features (EMAs, MACD, candle shape, returns, volume ratio) → RobustScaler → sliding windows → gap filter; plus `save_scaler` / `load_scaler` |
| `model.py` | `Encoder` + `Decoder` + `ConvAutoencoder` (1D CNN, 14→32 latent); `WindowDataset`; `make_dataloaders`; `save_model` / `load_model`; `save_kmeans` / `load_kmeans` |
| `guard.py` | `TrainingGuard` — detects 6 failure modes: NaN/Inf loss, explosion, collapse, overfitting, plateau, oscillation |
| `visualise.py` | 3 window rendering modes: contact sheet (View A), heatmap strip (View B), thumbnail grid (View C) |

### Jupyter Notebooks (`src/1DCNN_A/`)

| Notebook | Purpose | Produces |
|----------|---------|---------|
| `1dcnn_train.ipynb` | Load bars → features → scale → window → train autoencoder | `model.pt`, `scaler.pkl`, loss curve PNG |
| `latent_cluster.ipynb` | Extract latent vectors → K-Means → t-SNE scatter + centroid plots | `kmeans.pkl`, `KMeans.png` |
| `inference.ipynb` | Walk-forward bar-by-bar inference, 5-panel live dashboard | Live MSE + cluster assignment |
| `reconstruction.ipynb` | Original vs reconstructed window comparison, per-feature MSE bar chart | Comparison figures |
| `cluster_quality.ipynb` | Silhouette / Davies-Bouldin / Calinski-Harabasz for K=2..16 | Quality metric curves |
| `temporal_patterns.ipynb` | Cluster membership over time, by hour, by day of week | Temporal pattern charts |
| `contact_sheet.ipynb` | 2000 windows as scaled pixel blocks grid (View A) | `contact_sheet.png` |
| `heat_map.ipynb` | All windows stacked as feature-channel heatmap (View B) | `heatmap_strip.png` |
| `thumbnail_grid.ipynb` | 10×10px window thumbnails in grid (View C) | `thumbnail_grid.png` |
| `index.ipynb` | Dashboard / entry point listing all outputs | — |

### FastAPI Download Server (`src/alpaca_api/`)

| Component | Purpose |
|-----------|---------|
| `app.py` | FastAPI app entry point; starts MySQL table init on startup |
| `alpaca.py` | `fetch_bars()` + `fetch_news()` via httpx with Alpaca v2 pagination |
| `routes/bars.py` | `GET /bars` — paginate Alpaca, save to CSV and/or MySQL |
| `routes/news.py` | `GET /news` — fetch news articles, save to CSV and/or MySQL |
| `storage.py` | `save_bars_to_csv()`, `save_bars_to_db()`, `save_news_to_db()`, `save_news_to_csv()` |
| `db.py` | MySQL connection (`get_connection`) + table creation (`init_tables`) |
| `config.py` | dotenv → env vars: `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `DB_*`, `CSV_OUTPUT_DIR` |

---

## Component Disposition Map

### `backend/neural/model.py` — Reimplemented

**Source:** `1DCNN_A/model.py`

Keep the proven 1D CNN architecture exactly as-is:
- `Encoder`: 3× Conv1d (14→32→64→128 channels) + 3× MaxPool1d (64→32→16→8 time steps) → flatten → Linear(1024→32)
- `Decoder`: Linear(32→1024) → reshape(128,8) → 3× ConvTranspose1d (8→16→32→64 time steps) → (batch, 14, 64)
- `ConvAutoencoder`: Encoder + Decoder

Remove from this file: DataLoader helpers (→ `dataset.py`), save/load functions (→ `storage.py`).

No API, FastAPI, or WebSocket imports — pure ML only.

---

### `backend/neural/dataset.py` — Reimplemented

**Source:** `1DCNN_A/model.py` (WindowDataset, make_dataloaders) + `1DCNN_A/data.py` (make_windows, filter_gap_windows)

Consolidates all dataset preparation:
- `WindowDataset` — thin Dataset wrapper (input = target for autoencoder)
- `make_windows(df, feature_cols, window_size)` — stride-tricks sliding windows → (N, 64, 14)
- `filter_gap_windows(X, df, window_size)` — remove windows spanning overnight/weekend gaps
- `make_dataloaders(X_clean, test_split, batch_size)` — chronological split + DataLoaders (channels-first permute)

No API knowledge.

---

### `backend/neural/trainer.py` — Redesigned

**Source:** `1dcnn_train.ipynb` (training loop) + `1DCNN_A/guard.py` (TrainingGuard)

The training loop becomes a callable function/class that accepts a `progress_callback`. The callback is invoked each epoch with `{epoch, train_loss, val_loss, guard_status}` — the API layer calls `broadcast()` from `websocket/live.py`.

TrainingGuard logic (6 failure modes) is reimplemented here as a helper. No Jupyter cells, no notebook-specific output.

---

### `backend/neural/inference.py` — Reimplemented

**Source:** `inference.ipynb`

The walk-forward loop becomes a generator or async function that yields result dicts `{timestamp, mse, cluster_label, latent_vector}` for each bar. The API layer streams these via WebSocket. No matplotlib output.

---

### `backend/neural/metrics.py` — Reimplemented

**Source:** `cluster_quality.ipynb`

Pure functions returning dicts of scalar values — no matplotlib:
- `cluster_quality(Z, k_range)` → `{k: {silhouette, davies_bouldin, calinski_harabasz}, ...}`

---

### `backend/services/alpaca.py` — Reimplemented

**Source:** `alpaca_api/alpaca.py`

Keep: httpx, same Alpaca v2 bars pagination logic, same auth headers (`APCA-API-KEY-ID`, `APCA-API-SECRET-KEY`).

Change: Make fully async (`async def` + `httpx.AsyncClient`). News endpoint deferred — not needed for the ML workflow.

---

### `backend/services/config_manager.py` — Redesigned

**Source:** `1DCNN_A/config.py` (Config dataclass) + `alpaca_api/config.py` (env vars)

Reads/writes `backend/config/config.json`. Merges both config concerns (model hyperparameters + API credentials) into one place. Exposes `get()` and `update(partial_dict)` methods. All modules receive values from here — no hardcoded defaults anywhere else.

Example `config.json`:
```json
{
  "alpaca_key": "",
  "alpaca_secret": "",
  "symbol": "TSLA",
  "timeframe": "1Min",
  "start_date": "2024-01-01",
  "end_date": "2025-01-01",
  "window_size": 64,
  "latent_dim": 32,
  "batch_size": 256,
  "epochs": 10,
  "lr": 0.001,
  "test_split": 0.2,
  "n_clusters": 8,
  "guard_patience": 5,
  "guard_min_delta": 0.0001,
  "guard_overfit_ratio": 1.5
}
```

---

### `backend/services/downloader.py` — Redesigned

**Source:** `alpaca_api/routes/bars.py` + `alpaca_api/storage.py`

Service class `BarDownloader` that wraps `alpaca.py` and saves bars to CSV only (no MySQL). Reports progress via callback. Destination CSV: `backend/downloads/{symbol}/{timeframe}.csv`.

---

### `backend/services/storage.py` — Simplified + Extended

**Source:** `alpaca_api/storage.py` (CSV write) + `1DCNN_A/data.py` (load/scale/save) + `1DCNN_A/model.py` (save/load model artifacts)

Consolidates all file I/O into one module:
- `save_bars_to_csv()` / `load_bars()` — OHLCV CSV
- `save_model()` / `load_model()` — `models/model.pt`
- `save_scaler()` / `load_scaler()` — `models/scaler.pkl`
- `save_kmeans()` / `load_kmeans()` — `models/kmeans.pkl`

Remove: all MySQL/db code.

---

### `backend/api/config.py` — New

No v1 equivalent (config was a Python dataclass, not a REST endpoint).

- `GET /api/config` → return `config.json` contents as JSON
- `POST /api/config` → validate fields + write to `config.json`

---

### `backend/api/download.py` — Redesigned

**Source:** `alpaca_api/routes/bars.py`

- `POST /api/download` → start async `BarDownloader` task (symbol, timeframe, start, end)
- `GET /api/download/status` → current state (idle / running / done / error)
- Progress streamed via WebSocket `download_progress` events

---

### `backend/api/train.py` — New

No v1 equivalent (training was manual notebook execution).

- `POST /api/train` → start asyncio background task; runs full pipeline: load bars → features → scale → windows → dataloaders → training loop with TrainingGuard
- `POST /api/train/stop` → cancel the background task
- `GET /api/train/status` → current epoch, train/val loss, guard status
- Each epoch → WebSocket `training_epoch` broadcast

---

### `backend/api/infer.py` — New

**Source:** `inference.ipynb`

- `POST /api/infer` → start walk-forward inference for `{start, end}` date range
- `GET /api/infer/results` → return full results array after completion
- Each bar → WebSocket `infer_step` broadcast: `{timestamp, mse, cluster_label, latent_vector}`

---

### `backend/api/cluster.py` — New

**Source:** `latent_cluster.ipynb` + `cluster_quality.ipynb`

- `POST /api/cluster` → encode all training windows → fit/save K-Means → run t-SNE → return scatter coordinates (2D) + centroid profiles (N_CLUSTERS × LATENT_DIM)
- `GET /api/cluster/quality` → run `metrics.cluster_quality()` for K=2..16; return silhouette, Davies-Bouldin, Calinski-Harabasz per K

---

### `backend/api/windows.py` — New

**Source:** `visualise.py` (prepare_sample logic)

- `GET /api/windows?n=2000` → load training windows, clip to (p2, p98), scale to uint8, return as JSON array of `(WINDOW_SIZE × n_features)` flat arrays for `<canvas>` rendering in the frontend

---

### `backend/api/reconstruct.py` — New

**Source:** `reconstruction.ipynb` + `temporal_patterns.ipynb`

- `POST /api/reconstruct` → encode + decode N sampled windows; return `{original, reconstructed, per_feature_mse}` arrays
- `GET /api/temporal` → run encoder on all windows with timestamps; return cluster label timeline + by-hour distribution + by-weekday distribution

---

### `backend/api/status.py` — New

- `GET /api/status` → system health snapshot: model loaded, scaler loaded, kmeans loaded, training state, download state

---

### `backend/websocket/live.py` — New

No v1 equivalent.

`ConnectionManager` class: `connect()`, `disconnect()`, `broadcast(message: dict)`.

Single `/ws` endpoint. Message envelope: `{type, payload}`.

Message types:

| Type | Payload | Source |
|------|---------|--------|
| `download_progress` | `{bars_fetched, total_estimated}` | `api/download.py` |
| `training_epoch` | `{epoch, train_loss, val_loss, guard_status}` | `api/train.py` |
| `training_complete` | `{stop_reason, final_epoch}` | `api/train.py` |
| `infer_step` | `{timestamp, mse, cluster_label, latent_vector}` | `api/infer.py` |
| `heartbeat` | `{ts}` | `app.py` lifespan |
| `error` | `{message}` | any |

---

### `backend/app.py` — Redesigned

**Source:** `alpaca_api/app.py`

- Registers all routers (`config`, `download`, `train`, `infer`, `cluster`, `windows`, `reconstruct`, `status`)
- Mounts WebSocket endpoint `/ws`
- Configures logging: `logs/server.log` (all) + `logs/train.log` (training only); timestamps + severity
- CORS middleware: allow `http://localhost:5173` (Vite dev server)
- Lifespan hook: load `config.json` on startup; load model artifacts if present

---

### Frontend (React + Tailwind CSS v4 + Recharts) — New

No frontend in v1. All 10 visualisation notebooks are replaced by 7 browser pages.

**Navigation:** `react-router-dom` sidebar linking all pages.  
**State:** `useState` / `useEffect` only — no Redux, no Formik.  
**REST:** native `fetch()`.  
**WebSocket:** native `WebSocket` — single connection opened on app mount, event type dispatched to page subscribers.

---

#### Page 1 — Configuration

Replaces: `1DCNN_A/config.py` Config dataclass + `alpaca_api/config.py` env vars

- Form fields: API key, secret, symbol, timeframe, date range, window size, latent dim, epochs, LR, batch size, clusters, guard thresholds
- `GET /api/config` on mount → populate form
- `POST /api/config` on Save → persist to `config.json`

---

#### Page 2 — Download

Replaces: manual `GET /bars` calls + `alpaca_api/routes/bars.py`

- Inputs: symbol, timeframe, start date, end date
- Trigger Download button → `POST /api/download`
- Live progress bar driven by WebSocket `download_progress` events
- Result: bars downloaded, file path, row count

---

#### Page 3 — Train

Replaces: `1dcnn_train.ipynb` + `guard.py` terminal output

- Start / Stop buttons → `POST /api/train` / `/api/train/stop`
- **Panel A — Loss Curves** (Recharts LineChart, 2 series): train loss + val loss per epoch; live-updates via WebSocket `training_epoch`
- **Panel B — Guard Status**: current condition displayed as badge (plateau / oscillation / collapse / overfit / ok); stop reason shown on completion
- Model checkpoint indicator: epoch saved, `model.pt` file size

---

#### Page 4 — Latent Space

Replaces: `latent_cluster.ipynb` + `cluster_quality.ipynb`

- "Extract + Cluster" button → `POST /api/cluster`
- **Panel A — t-SNE Scatter** (Recharts ScatterChart): 2D projection, points coloured by cluster label
- **Panel B — Centroid Profiles** (Recharts LineChart, one line per cluster): mean activation across 32 latent dimensions
- **Panel C — Cluster Quality** (Recharts LineChart, 3 series): silhouette, Davies-Bouldin, Calinski-Harabasz for K=2..16 from `GET /api/cluster/quality`

---

#### Page 5 — Windows

Replaces: `visualise.py` + `contact_sheet.ipynb` + `heat_map.ipynb` + `thumbnail_grid.ipynb`

- "Load Windows" button → `GET /api/windows?n=2000`
- Backend returns uint8 pixel arrays; frontend renders to `<canvas>` elements
- **Panel A — Contact Sheet**: grid of scaled 64×14 window images (CSS grid + canvas)
- **Panel B — Heatmap Strip**: all sample windows stacked as one wide canvas
- **Panel C — Thumbnail Grid**: 10×10px thumbnails in grid via canvas

---

#### Page 6 — Analysis

Replaces: `reconstruction.ipynb` + `temporal_patterns.ipynb`

- "Run Analysis" button → `POST /api/reconstruct`
- **Panel A — Reconstruction Comparison**: side-by-side canvas rendering of original vs reconstructed windows for N samples
- **Panel B — Per-Feature MSE** (Recharts BarChart): mean reconstruction error per feature column
- **Panel C — Temporal Patterns** (Recharts LineChart + BarChart): cluster label over time; by-hour-of-day distribution; by-day-of-week distribution; from `GET /api/temporal`

---

#### Page 7 — Live Inference

Replaces: `inference.ipynb` entire walk-forward loop + 5-panel dashboard

- Date range inputs: INFER_START, INFER_END
- Start / Pause / Reset buttons → `POST /api/infer`
- **Panel A — MSE Timeline** (Recharts LineChart): reconstruction error per window; live via WebSocket `infer_step`; 95th-percentile threshold line
- **Panel B — Current Bar**: timestamp, OHLCV, MSE, cluster label (plain table)
- **Panel C — Window Image**: current 64×14 window as greyscale `<canvas>`
- **Panel D — Latent Vector** (Recharts BarChart, blue=positive / red=negative): 32 activations for current window
- **Panel E — Cluster History** (colour strip, custom Recharts or CSS): cluster assignment for last 200 windows

---

## What Is Omitted from v2

| v1 Component | Reason |
|--------------|--------|
| MySQL / `db.py` / `pymysql` | CSV-only storage is sufficient; removes deployment complexity |
| `alpaca_api/routes/news.py` | Not part of the ML workflow |
| All Jupyter notebooks (`*.ipynb`) | Replaced by the 7 React pages |
| `Jupyter` / `JupyterLab` dependency | Not needed in v2 |
| Celery / Redis / RabbitMQ | Explicitly excluded in spec; asyncio is sufficient |
| `tqdm` progress bars | Replaced by WebSocket progress events |
| `Pillow` / PIL thumbnail rendering | Frontend renders pixel arrays to canvas directly |

---

## v2 Directory Structure with Source Annotations

```
src/v2/
├── backend/
│   ├── app.py                         ← redesigned from alpaca_api/app.py
│   ├── api/
│   │   ├── config.py                  ← new (replaces Config dataclass)
│   │   ├── download.py                ← redesigned from alpaca_api/routes/bars.py
│   │   ├── train.py                   ← new (replaces 1dcnn_train.ipynb)
│   │   ├── infer.py                   ← reimplemented from inference.ipynb
│   │   ├── status.py                  ← new
│   │   ├── cluster.py                 ← new (reimplemented from latent_cluster.ipynb + cluster_quality.ipynb)
│   │   ├── windows.py                 ← new (reimplemented from visualise.py)
│   │   └── reconstruct.py             ← new (reimplemented from reconstruction.ipynb + temporal_patterns.ipynb)
│   ├── websocket/
│   │   └── live.py                    ← new (no WebSocket in v1)
│   ├── neural/
│   │   ├── model.py                   ← reimplemented from 1DCNN_A/model.py
│   │   ├── dataset.py                 ← reimplemented from 1DCNN_A/model.py + data.py
│   │   ├── trainer.py                 ← redesigned from 1dcnn_train.ipynb + guard.py
│   │   ├── inference.py               ← reimplemented from inference.ipynb
│   │   └── metrics.py                 ← reimplemented from cluster_quality.ipynb
│   ├── services/
│   │   ├── alpaca.py                  ← reimplemented from alpaca_api/alpaca.py (async)
│   │   ├── config_manager.py          ← redesigned from 1DCNN_A/config.py + alpaca_api/config.py
│   │   ├── downloader.py              ← redesigned from alpaca_api/storage.py + bars.py
│   │   └── storage.py                 ← simplified from alpaca_api/storage.py + data.py + model.py
│   ├── config/
│   │   └── config.json                ← replaces Config dataclass + .env
│   ├── downloads/                     ← CSV files (was data/{SYMBOL}/{TIMEFRAME}.csv)
│   ├── models/                        ← model.pt, scaler.pkl, kmeans.pkl (was data/{SYMBOL}/)
│   ├── logs/                          ← server.log, train.log (new)
│   └── requirements.txt
├── tests/
│   ├── api/
│   │   ├── test_config.py
│   │   ├── test_download.py
│   │   ├── test_train.py
│   │   ├── test_infer.py
│   │   ├── test_cluster.py
│   │   ├── test_windows.py
│   │   ├── test_reconstruct.py
│   │   └── test_status.py
│   ├── neural/
│   │   ├── test_model.py
│   │   ├── test_dataset.py
│   │   ├── test_trainer.py
│   │   ├── test_inference.py
│   │   └── test_metrics.py
│   ├── services/
│   │   ├── test_alpaca.py
│   │   ├── test_config_manager.py
│   │   ├── test_downloader.py
│   │   └── test_storage.py
│   ├── websocket/
│   │   └── test_live.py
│   ├── fixtures/
│   │   ├── sample_config.json
│   │   ├── sample_ohlcv.csv
│   │   └── sample_model.pt
│   └── conftest.py
└── frontend/
    └── (React + Vite + Tailwind CSS v4 + Recharts + react-router-dom)
```

---

## Architectural Improvements Over v1

| Concern | v1 | v2 |
|---------|----|----|
| Training | Run notebook cells manually | `POST /api/train` → asyncio background task |
| Training feedback | `print()` statements | WebSocket `training_epoch` per epoch |
| Inference | Run `inference.ipynb` manually | `POST /api/infer` → results streamed live |
| Configuration | Python dataclass + `.env` | `config.json` editable via REST + browser form |
| Data download | `curl GET /bars` or httpx manually | React Download page + WebSocket progress |
| Visualisation | Matplotlib PNG files | React + Recharts (interactive, live-updating) |
| Window rendering | PIL/Pillow → PNG | Browser `<canvas>` from JSON pixel arrays |
| Storage | CSV + MySQL | CSV only (simpler, fewer dependencies) |
| Scheduling | Not applicable | asyncio `BackgroundTask` (no Celery/Redis) |
| Test coverage | Zero automated tests | pytest; one test module per production module |

---

## Dependency Changes

**Removed:**
- `pymysql` — no MySQL
- `jupyter`, `jupyterlab` — no notebooks
- `tqdm` — WebSocket progress replaces terminal progress bars
- `Pillow` / PIL — canvas rendering replaces server-side image generation

**Retained:**
- `torch`, `numpy`, `pandas`, `scikit-learn`, `matplotlib`
- `fastapi`, `uvicorn`, `httpx`

**Added:**
- `websockets` — FastAPI WebSocket transport
- `pytest`, `pytest-asyncio` — test infrastructure
- `httpx` as test client (already a dependency)

---

## Implementation Order

1. Scaffold `src/v2/` directory tree + `requirements.txt` + `README.md`
2. `services/config_manager.py` — everything else reads config
3. `services/storage.py` — I/O foundation
4. `services/alpaca.py` — async httpx Alpaca client
5. `services/downloader.py` — wraps alpaca + storage
6. `neural/model.py` — pure PyTorch autoencoder
7. `neural/dataset.py` — windowing + DataLoader
8. `neural/trainer.py` — training loop + guard + progress callback
9. `neural/inference.py` — walk-forward loop
10. `neural/metrics.py` — cluster quality metrics
11. `websocket/live.py` — ConnectionManager + broadcast
12. `api/config.py` + `api/status.py` — config CRUD + health check
13. `api/download.py` — bar downloader endpoint
14. `api/train.py` — training trigger + stop
15. `api/infer.py` — walk-forward inference endpoint
16. `api/cluster.py` — latent extraction + K-Means + t-SNE + cluster quality
17. `api/windows.py` — window pixel array endpoint
18. `api/reconstruct.py` — reconstruction analysis + temporal patterns
19. `app.py` — wire all routers + WebSocket + logging + CORS
20. `tests/` — conftest + one test file per production module
21. `frontend/` — React scaffold + 7 pages (Configuration, Download, Train, Latent Space, Windows, Analysis, Live Inference)
