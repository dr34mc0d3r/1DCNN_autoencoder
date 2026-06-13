# 1DCNN-A v2 — Stock Market Pattern Detection

A full-stack application for training a **1D CNN autoencoder** on stock market bar data and using it to discover hidden patterns, detect anomalies, and classify market regimes — all through a live browser interface.

---

## What it does

The app downloads OHLCV bar data from [Alpaca Markets](https://alpaca.markets), engineers 26 technical features from that data, and trains a convolutional autoencoder to compress each short clip of bars into a compact latent vector. It then clusters those vectors, visualises them, and lets you run walk-forward inference on any date range — watching reconstruction error and cluster assignments update in real time.

**Key capabilities:**

- Download and manage bar data for any Alpaca-supported symbol and timeframe
- Train a 1D CNN autoencoder with live loss curves and automatic early stopping
- Cluster latent space with K-Means and find the optimal K via Silhouette / Davies-Bouldin / Calinski-Harabasz scoring
- Visualise training windows as contact sheets, heatmaps, and thumbnail grids
- Compare original vs reconstructed windows feature-by-feature
- Analyse cluster distribution by hour-of-day and day-of-week
- Run live walk-forward inference with real-time MSE timeline, latent vector display, and cluster history strip
- Cross-symbol inference: train on one symbol, infer on another

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Browser (React)                │
│  Setup · Train · Windows · Latent Space         │
│  Analysis · Live Inference                      │
│  Recharts · Tailwind CSS v4 · Vite              │
└──────────┬──────────────────────┬───────────────┘
           │  REST /api/*         │  WebSocket /ws
           ▼                      ▼
┌─────────────────────────────────────────────────┐
│              FastAPI Backend (Python 3.12)      │
│                                                 │
│  api/          REST routers (8 modules)         │
│  neural/       ConvAutoencoder · trainer        │
│                inference · metrics              │
│  services/     Alpaca client · storage          │
│                config manager                   │
│  websocket/    ConnectionManager · /ws          │
│  config/       config.json  ← single truth      │
└──────────┬──────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────┐
│  Alpaca Markets API          CSV files (local)  │
│  OHLCV bar data              downloads/         │
│                              models/            │
└─────────────────────────────────────────────────┘
```

No database. No Celery. No Redux. The entire stack is: FastAPI + asyncio + native `fetch()` + WebSocket.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Python 3.12 |
| Package manager | [uv](https://docs.astral.sh/uv/) |
| Backend framework | FastAPI + Uvicorn |
| Machine learning | PyTorch (`<2.3`), scikit-learn |
| Data | pandas, numpy |
| Frontend | React 18, Vite |
| Charts | Recharts |
| Styling | Tailwind CSS v4 |
| Real-time | WebSocket (native) |
| Data source | Alpaca Markets API |
| Storage | CSV files |

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Python | 3.12 | [python.org](https://www.python.org/) |
| uv | any | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| npm | 10+ | Included with Node.js |
| Alpaca account | — | [alpaca.markets](https://alpaca.markets) — free data plan is sufficient |

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/1dcnn-a.git
cd 1dcnn-a
```

### 2. Install Python dependencies

```bash
uv pip install -r src/v2/backend/requirements.txt
```

### 3. Create your `.env` file

Copy the example and fill in your Alpaca credentials:

```bash
cp .env.example .env
```

```dotenv
# .env
ALPACA_API_KEY=your_api_key_here
ALPACA_SECRET_KEY=your_secret_key_here
ALPACA_DATA_BASE_URL=https://data.alpaca.markets
```

Credentials are read directly from `.env` at startup. They are never written to `config.json` or exposed through the API.

### 4. Install frontend dependencies

```bash
cd src/v2/frontend
npm install
```

---

## Running

Open two terminals and run both processes simultaneously.

**Terminal 1 — Backend**

```bash
cd src/v2/backend
uv run uvicorn app:app --reload --port 8000
```

API server: `http://localhost:8000`  
Interactive API docs: `http://localhost:8000/docs`

**Terminal 2 — Frontend**

```bash
cd src/v2/frontend
npm run dev
```

App: `http://localhost:5173`

The Vite dev server proxies all `/api` and `/ws` requests to `localhost:8000`, so both processes must be running at the same time.

---

## Workflow

The app has six pages. Work through them left to right.

### 1 · Setup

Two sections in one page.

**Config** — Set your symbol, timeframe, date range, and all model hyperparameters. Every field has an inline info button (ⓘ) that explains what it does and what values to try. Click **Save Config** to persist to `config.json`.

**Download** — Enter a symbol, timeframe, and date range, then click **Start Download**. A live progress bar updates via WebSocket as bars are fetched from Alpaca. The **Available Downloads** panel below lists every CSV already on disk — ticker, timeframe, start, end, and row count. Click **Use** to load a file's settings into the form, or **Delete** to remove it.

### 2 · Train

Expand **Training Data Preview** first to verify the pipeline loaded your CSV correctly: total bars, total windows, train/test counts, and the first 20 rows of each split.

Enter a model name, then click **Start Training**. The loss curve (train + val) updates live every epoch via WebSocket. Training stops automatically when the **TrainingGuard** detects any of six conditions:

| Condition | Meaning |
|---|---|
| Plateau | Val loss hasn't improved by `guard_min_delta` for `guard_patience` epochs |
| Overfitting | `val_loss / train_loss > guard_overfit_ratio` |
| Explosion | Loss increased more than `guard_explosion_factor` × the initial value |
| Collapse | Loss fell below `guard_collapse_threshold` (near-zero — likely trivial data) |
| Oscillation | Loss is bouncing without converging (detected via coefficient of variation) |
| Max epochs | The configured `epochs` limit was reached |

Click **Stop** at any time to interrupt gracefully. The model is saved whether you stop early or the guard triggers.

Saved artefacts:

```
src/v2/backend/models/
├── {model_name}_model.pt      PyTorch state dict
├── {model_name}_scaler.pkl    RobustScaler (fitted on training data)
├── {model_name}_kmeans.pkl    K-Means (fitted on Latent Space page)
└── active.json                Pointer to the currently active model
```

### 3 · Windows

Click **Load Windows** and set the count (1–10,000). Toggle between three views:

| View | What you see |
|---|---|
| Contact Sheet | Windows laid out side by side — scan for repeating visual textures |
| Heatmap Strip | All windows stacked; great for spotting temporal patterns across the dataset |
| Thumbnail Grid | Compact grid — useful for getting a quick sense of diversity |

Each window is a 2D pixel image: rows = 14 feature channels, columns = bars in the window. Dark pixels = low normalised value; bright pixels = high value. Clipped to the 2nd–98th percentile for contrast.

### 4 · Latent Space

Click **Extract + Cluster**. The backend encodes every training window into its latent vector, fits K-Means, and runs t-SNE to project the vectors to 2D. The scatter plot shows one coloured dot per window, grouped by cluster. Centroid markers show the centre of each group.

Click **Cluster Quality** to run Silhouette, Davies-Bouldin, and Calinski-Harabasz scoring for K = 2 through 16. Use the resulting chart to pick the K where Silhouette peaks and Davies-Bouldin troughs. Update `n_clusters` in Config and re-run Extract + Cluster — you don't need to retrain the neural model.

**Reading the scatter plot:**

| Shape | Meaning |
|---|---|
| Tight, round clusters far apart | Strong, distinct patterns |
| Elongated sausage shapes | A gradual spectrum between two states |
| One giant cluster + small satellites | One dominant regime, rare excursions |
| All clusters the same size | No dominant regime — the market cycles evenly |
| Overlapping blobs | Too many clusters, or model needs more training |

### 5 · Analysis

Four independent panels. Each has its own **Execute** button so you can run them in any order.

**Reconstruction Comparison** — Encodes then decodes 20 sample windows. Displays each original and its reconstruction side by side as pixel images, plus a per-feature MSE bar chart sorted from worst to best. Features the model reconstructs poorly are the ones it finds hardest to compress — often the noisiest or least correlated with the rest.

**Hour-of-Day Heatmap** — A CSS grid where rows are clusters and columns are market hours (9 AM–4 PM). Cell brightness = relative window frequency at that hour. Shows which clusters are characteristic of the open, midday, or close.

**Cluster Frequency by Hour** — Stacked bar chart: bars = market hours, colours = clusters. Shows the absolute count of windows per cluster per hour.

**Day-of-Week Distribution** — Stacked bar chart: bars = trading days (Mon–Fri), colours = clusters. Reveals whether certain market regimes concentrate on specific days.

### 6 · Live Inference

Set a date range (within your downloaded data), symbol, and timeframe, then click **Start**. The backend runs walk-forward inference — sliding a window one bar at a time through the data — and streams results via WebSocket. Five panels update in real time:

| Panel | What it shows |
|---|---|
| MSE Timeline | Reconstruction error per window + a red p95 threshold line. Spikes = unusual patterns |
| Current Bar | Timestamp, MSE value, and cluster label for the most recent window |
| Current Window | Greyscale canvas of the 14 × window_size feature matrix just processed |
| Latent Vector | Bar chart of all 32 latent values (indigo = positive, red = negative) |
| Cluster History | Colour strip of the last 200 cluster assignments — long runs = persistent regime |

Expand **How to read these charts** for a built-in guide inside the app.

**Cross-symbol inference:** The active model was trained on one symbol, but you can infer on any other. If the cross-symbol MSE stays low, the two assets share structural patterns. Chronically high MSE means the model finds the new symbol structurally foreign.

---

## Model Architecture

### ConvAutoencoder

**Encoder** — compresses a window into a latent vector:

```
Input:  (batch, 14 features, window_size bars)
        ↓
Conv1d(14 → 32, k=3, pad=1) + ReLU + MaxPool1d(2)   → (batch, 32, window_size/2)
Conv1d(32 → 64, k=3, pad=1) + ReLU + MaxPool1d(2)   → (batch, 64, window_size/4)
Conv1d(64 → 128, k=3, pad=1) + ReLU + MaxPool1d(2)  → (batch, 128, window_size/8)
Flatten → Linear(128 × window_size/8 → latent_dim)
        ↓
Output: (batch, latent_dim)   ← the latent vector
```

**Decoder** — reconstructs the original window from the latent vector:

```
Input:  (batch, latent_dim)
        ↓
Linear(latent_dim → 128 × window_size/8) → reshape to (batch, 128, window_size/8)
ConvTranspose1d(128 → 64, k=4, s=2, pad=1) + ReLU  → (batch, 64, window_size/4)
ConvTranspose1d(64 → 32, k=4, s=2, pad=1) + ReLU   → (batch, 32, window_size/2)
ConvTranspose1d(32 → 14, k=4, s=2, pad=1)           → (batch, 14, window_size)
        ↓
Output: (batch, 14, window_size)   ← reconstructed window
```

**Training:** MSE loss, Adam optimiser, RobustScaler normalisation per feature. The scaler is fit on training data only and applied to both splits.

---

## Feature Engineering

The pipeline automatically derives 26 features from raw OHLCV bars. You never calculate these manually.

| Category | Features |
|---|---|
| Trend | EMA-9, EMA-21, EMA-50, MACD line, MACD signal, MACD histogram |
| Candle shape | Body size, upper wick, lower wick, candle efficiency |
| Returns | Simple return, log return, volume return |
| Volatility | ATR-14, rolling volatility, Bollinger Band width, Bollinger Band position |
| Momentum | RSI-14, Stochastic %K, Stochastic %D, VWAP deviation, volume ratio |
| Time of day | Hour-of-day sine, hour-of-day cosine (cyclic encoding) |
| Price | Normalised close |

---

## Configuration Reference

All settings live in `src/v2/backend/config/config.json` and can be edited from the Config page in the browser.

### Data

| Key | Default | Description |
|---|---|---|
| `symbol` | `"TSLA"` | Stock ticker (uppercase) |
| `timeframe` | `"1Min"` | Bar interval: `1Min` `5Min` `15Min` `30Min` `1Hour` `4Hour` `1Day` |
| `start_date` | — | Download start date (`YYYY-MM-DD`) |
| `end_date` | — | Download end date (`YYYY-MM-DD`) |

### Model

| Key | Default | Description |
|---|---|---|
| `window_size` | `64` | Number of bars per training window |
| `latent_dim` | `32` | Size of the compressed latent vector |
| `batch_size` | `64` | Training batch size |
| `epochs` | `100` | Maximum training epochs |
| `lr` | `0.0001` | Initial learning rate |
| `test_split` | `0.2` | Fraction of windows held out for validation |
| `n_clusters` | `8` | K-Means cluster count |

### TrainingGuard (early stopping)

| Key | Default | Description |
|---|---|---|
| `guard_patience` | `10` | Epochs without val improvement before stopping |
| `guard_min_delta` | `1e-5` | Minimum improvement to count as progress |
| `guard_overfit_ratio` | `10` | `val_loss / train_loss` ceiling before stopping |
| `guard_explosion_factor` | `10` | `current_loss / initial_loss` ceiling |
| `guard_oscillation_window` | `10` | Window size for oscillation detection |
| `guard_oscillation_cv` | `0.9` | Coefficient-of-variation threshold |
| `guard_collapse_threshold` | `1e-6` | Minimum loss floor (below = trivial) |

### LR Schedulers

| Scheduler | Key | Additional parameters |
|---|---|---|
| `none` | No scheduling | — |
| `step` | Decay every N epochs | `scheduler_step_size`, `scheduler_step_gamma` |
| `plateau` | Decay when val plateaus | `scheduler_plateau_patience`, `scheduler_plateau_factor`, `scheduler_plateau_min_lr` |
| `multistep` | Decay at specific epochs | `scheduler_multistep_milestones` (e.g. `"20,40,60"`), `scheduler_multistep_gamma` |
| `cosine` | Cosine annealing | `scheduler_cosine_t_max`, `scheduler_cosine_eta_min` |
| `exponential` | Exponential decay each epoch | `scheduler_exp_gamma` |
| `warmup` | Linear warmup then constant | `scheduler_warmup_epochs`, `scheduler_warmup_start_factor` |
| `cyclic` | Triangular LR cycles | `scheduler_cyclic_base_lr`, `scheduler_cyclic_max_lr`, `scheduler_cyclic_step_size`, `scheduler_cyclic_mode` |

---

## API Reference

### Config

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/config` | Return full config dict |
| `POST` | `/api/config` | Merge partial update, return updated config |

### Status

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/status` | `{model_loaded, scaler_loaded, kmeans_loaded, training, downloading, symbol, timeframe}` |

### Data Download

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/download` | Start async bar download |
| `GET` | `/api/download/status` | Current download state |
| `GET` | `/api/download/list` | All CSVs on disk with metadata |
| `DELETE` | `/api/download/list/{ticker}/{timeframe}` | Delete a CSV |

### Training

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/train` | Start training (body: `{"model_name": "..."}`) |
| `POST` | `/api/train/stop` | Request training cancellation |
| `GET` | `/api/train/status` | Training state + current loss |
| `GET` | `/api/train/data-preview` | Pipeline stats + first 20 rows of each split |

### Models

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/models` | List all saved model bundles |
| `GET` | `/api/models/active` | Active bundle metadata |
| `POST` | `/api/models/{name}/activate` | Switch active model |
| `POST` | `/api/models/deactivate` | Clear active model pointer |
| `DELETE` | `/api/models/{name}` | Delete a saved bundle |

### Clustering

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/cluster` | Extract latents, fit K-Means, run t-SNE |
| `GET` | `/api/cluster` | Scatter coords + centroids + labels |
| `GET` | `/api/cluster/quality` | Silhouette / DB / CH scores for K = 2..16 |

### Inference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/infer` | Start walk-forward inference |
| `POST` | `/api/infer/stop` | Cancel inference |
| `GET` | `/api/infer/results` | All completed inference results |

### Analysis

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/windows` | Sample of N training windows as pixel arrays |
| `POST` | `/api/reconstruct` | Encode + decode N windows, return per-feature MSE |
| `GET` | `/api/temporal` | Cluster timeline + hour-of-day + day-of-week distributions |

### WebSocket

| Event | Payload fields |
|---|---|
| `download_progress` | `bars_fetched`, `symbol` |
| `training_epoch` | `epoch`, `train_loss`, `val_loss`, `guard_status`, `lr` |
| `training_complete` | `stop_reason`, `final_epoch`, `model_name` |
| `infer_step` | `timestamp`, `mse`, `cluster_label`, `latent_vector` |
| `cluster_complete` | `n_clusters`, `n_windows` |
| `heartbeat` | `ts` |
| `error` | `message` |

All real-time events arrive on a single WebSocket connection at `ws://localhost:8000/ws`. The frontend subscribes once at app startup.

---

## File Layout

```
1dcnn-a/
├── .env                          Alpaca credentials (never committed)
├── .env.example                  Template for .env
├── pyproject.toml                Project metadata + root dependencies
├── README.md                     This file (v2)
├── README_v1.md                  Original v1 README
│
└── src/v2/
    ├── backend/
    │   ├── app.py                FastAPI entry point
    │   ├── requirements.txt      Python dependencies
    │   ├── config/
    │   │   └── config.json       All settings (auto-created on first run)
    │   ├── api/                  REST routers
    │   │   ├── config.py
    │   │   ├── download.py
    │   │   ├── train.py
    │   │   ├── infer.py
    │   │   ├── cluster.py
    │   │   ├── windows.py
    │   │   ├── reconstruct.py
    │   │   ├── models.py
    │   │   └── status.py
    │   ├── neural/               Pure ML — no API code
    │   │   ├── model.py          ConvAutoencoder (Encoder + Decoder)
    │   │   ├── trainer.py        Training loop + TrainingGuard
    │   │   ├── dataset.py        WindowDataset + DataLoader factory
    │   │   ├── inference.py      walk_forward() async generator
    │   │   └── metrics.py        Cluster quality scoring
    │   ├── services/
    │   │   ├── config_manager.py Load/update config.json
    │   │   ├── storage.py        CSV load/save, feature pipeline, model artefacts
    │   │   ├── downloader.py     BarDownloader wrapper
    │   │   └── alpaca.py         Alpaca Markets API client
    │   ├── websocket/
    │   │   └── live.py           ConnectionManager + /ws endpoint
    │   ├── downloads/            Bar CSVs — {SYMBOL}/{TIMEFRAME}.csv
    │   ├── models/               Saved model bundles — *.pt, *.pkl
    │   └── logs/
    │       └── server.log
    ├── frontend/
    │   ├── src/
    │   │   ├── App.jsx           Routes + NavBar
    │   │   ├── api.js            All REST calls (fetch wrapper)
    │   │   ├── ws.js             WebSocket singleton
    │   │   ├── components/
    │   │   │   ├── NavBar.jsx
    │   │   │   ├── FieldInfo.jsx  Inline help tooltips (ⓘ)
    │   │   │   └── PanelInfo.jsx  Panel-level guidance
    │   │   └── pages/
    │   │       ├── SetupPage.jsx
    │   │       ├── ConfigPage.jsx
    │   │       ├── DownloadPage.jsx
    │   │       ├── TrainPage.jsx
    │   │       ├── LatentSpacePage.jsx
    │   │       ├── WindowsPage.jsx
    │   │       ├── AnalysisPage.jsx
    │   │       └── InferencePage.jsx
    │   ├── package.json
    │   └── vite.config.js
    ├── tests/                    pytest suite (one file per production module)
    └── docs/
        └── HowTo_Find_Patterns.md  End-to-end pattern-finding tutorials
```

---

## Testing

The test suite uses pytest and runs entirely in isolated temp directories — it never touches your real `downloads/` or `models/` folders.

```bash
# Run all tests
cd src/v2
uv run pytest

# Run a specific module with verbose output
uv run pytest tests/neural/test_model.py -v
uv run pytest tests/api/test_config.py -v
```

---

## Design Decisions

**No database.** All data lives in CSV files under `backend/downloads/`. No Docker, no MariaDB, no connection strings. The tradeoff is that querying across multiple symbols requires loading multiple files, but for a single-user research tool this is a net simplification.

**No Celery or Redis.** Long-running tasks (download, training, inference) use FastAPI's `BackgroundTasks` with asyncio. A simple `asyncio.Event` handles cancellation. This removes an entire infrastructure layer at the cost of no task persistence across server restarts.

**No Axios or Redux.** The frontend uses the browser's native `fetch()` for REST calls and a single `ws.js` singleton for WebSocket. No global state library — each page manages its own state with React hooks. The app is small enough that this is cleaner than introducing a framework.

**`config.json` as single source of truth.** No hardcoded defaults anywhere in the codebase. Every configurable value — model hyperparameters, guard thresholds, scheduler settings — lives in one file and is loaded fresh on each request. Changing a value in the browser takes effect on the next training run without restarting the server.

**WebSocket broadcasts everything.** The frontend opens one WebSocket connection at startup and receives training epochs, inference steps, download progress, and heartbeats all on the same channel. No polling. No multiple connections.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Loss is flat from epoch 1 | Learning rate too low | Increase `lr` to `0.001` or `0.005` |
| Loss spikes up after a few epochs | Learning rate too high | Halve `lr`; switch scheduler to `plateau` |
| t-SNE shows one blob with no clusters | Model underfit | Increase `epochs`; reduce `latent_dim` |
| All clusters the same size | `n_clusters` too high | Run Cluster Quality and use the suggested K |
| TrainingGuard stops at epoch 1–2 ("collapse") | Dataset too small or window too large | Extend date range; reduce `window_size` |
| Download stalls at 0 bars | Invalid API key or network issue | Check `.env` credentials; verify Alpaca subscription |
| Frontend can't reach `/api` | Backend not running | Start `uvicorn` in a separate terminal first |
| `model.pt` not found on Latent Space page | No training run completed | Complete a training run before clustering |

---

## Further Reading

- `src/v2/RUNNING.md` — Detailed step-by-step startup guide
- `src/v2/docs/HowTo_Find_Patterns.md` — Five end-to-end tutorials for finding market patterns with the 1D CNN

---

## License

MIT
