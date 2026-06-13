# Running the v2 App

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.12 | Pinned via `.python-version` at project root |
| uv | any | Package manager — install from https://docs.astral.sh/uv/ |
| Node.js | 18+ | For the React frontend |
| npm | 10+ | Comes with Node.js |

No database required — v2 uses CSV files only.

---

## 1. Backend

### Install dependencies

From the project root (installs into the shared `.venv`):

```bash
uv pip install -r src/v2/backend/requirements.txt
```

### Credentials

Alpaca credentials are read automatically from the root `.env` file:

```
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
ALPACA_DATA_BASE_URL=https://data.alpaca.markets
```

They are never written to `config.json`. All other settings can be changed
from the browser (Config page).

### Start the server

```bash
cd src/v2/backend
uv run uvicorn app:app --reload --port 8000
```

The API is now running at **http://localhost:8000**.  
Interactive docs: **http://localhost:8000/docs**

---

## 2. Frontend

In a second terminal:

```bash
cd src/v2/frontend
npm install
npm run dev
```

The app opens at **http://localhost:5173**.

The Vite dev server proxies `/api` and `/ws` to `localhost:8000`, so both
backend and frontend must be running at the same time.

---

## 3. First-time workflow

Open **http://localhost:5173** and follow these steps in order:

### Step 1 — Config page
Set your Alpaca API key, secret, symbol, timeframe, and date range. Click **Save**.

### Step 2 — Download page
Enter the symbol and date range, then click **Start Download**. A progress bar
updates live via WebSocket. The bars are saved to
`src/v2/backend/downloads/<SYMBOL>/<TIMEFRAME>.csv`.

The **Available Downloads** panel below the form lists every CSV already on
disk — Ticker, Timeframe, Start, End, and row count. Click **Use** to
populate the download form with that file's settings, or **Delete** (confirm
inline) to remove it.

### Step 3 — Train page
Before starting, expand **Training Data Preview** to see how the pipeline
splits your data: total bars, total windows, train/test window counts, and
the first 20 rows of each split. This confirms the CSV loaded correctly and
the split is what you expect.

Click **Start Training**. The loss-curve chart updates every epoch. Training
stops automatically when the guard detects a plateau, explosion, collapse, or
overfitting — or after the configured number of epochs. The model, scaler, and
config are saved to `src/v2/backend/models/`.

You can click **Stop** at any time to interrupt training.

### Step 4 — Latent Space page
Click **Extract + Cluster**. A status card shows progress while the backend
encodes all windows and fits K-Means. When done, the t-SNE scatter appears
coloured by cluster alongside a **Clustering Report** — total window count,
number of clusters, and a per-cluster table showing the window share of each
cluster with a colour swatch and bar.

Click **Cluster Quality** (its own spinner) to see silhouette /
Davies-Bouldin / Calinski-Harabasz scores for K = 2 … 16 to help pick the
best K. Update `n_clusters` in Config and re-run Extract + Cluster to apply.

### Step 5 — Windows page
Click **Load Windows**, then toggle between three views:
- **Contact Sheet** — grid of scaled window images
- **Heatmap Strip** — all windows stacked side by side
- **Thumbnail Grid** — compact thumbnails

### Step 6 — Analysis page
Each panel has its own **Execute** button and spinner so you can run them
independently without waiting for all charts to finish.

- **Reconstruction Comparison** — encode then decode 20 windows; compare
  originals and reconstructions side by side, plus a per-feature MSE bar chart.
- **Hour-of-Day Heatmap** — CSS grid where rows are clusters and columns are
  market hours; cell brightness = relative window frequency. Shows which
  clusters are characteristic of the open vs the close.
- **Cluster Frequency by Hour** — stacked bar chart of window counts per
  cluster at each hour.
- **Day-of-Week Distribution** — stacked bar chart of window counts per
  cluster for each trading day.

### Step 7 — Live Inference page
Set a date range within your downloaded data, then click **Start**. The five
panels update in real time as each bar is processed:

- **Panel A — MSE Timeline**: reconstruction error per window with a p95
  threshold line. Spikes signal patterns the model hasn't seen before.
- **Panel B — Current Bar**: timestamp, MSE, and cluster label for the latest bar.
- **Panel C — Current Window**: greyscale canvas of the 14-feature × 64-bar
  window the model just processed.
- **Panel D — Latent Vector**: bar chart of the 32-dim latent representation
  (indigo = positive, red = negative).
- **Panel E — Cluster History**: colour-coded strip of the last 200 cluster
  assignments. Long runs of one colour = persistent regime.

Expand **? How to read these charts** for a built-in guide explaining each
panel, what healthy output looks like, and what to watch for.

---

## 4. Running the test suite

```bash
cd src/v2
uv run pytest
```

Tests run in an isolated temp directory — they never touch your real
`downloads/` or `models/` folders.

To run a specific module:

```bash
uv run pytest tests/neural/test_model.py -v
uv run pytest tests/api/test_config.py -v
```

---

## 5. File layout after first run

```
src/v2/backend/
├── config/config.json      ← your settings (edit here or via Config page)
├── downloads/
│   └── TSLA/
│       └── 5Min.csv        ← bars saved by the Download page
└── models/
    ├── model.pt            ← saved after training
    ├── scaler.pkl          ← RobustScaler fitted during training
    └── kmeans.pkl          ← K-Means fitted on the Latent Space page
```

---

## 6. Stopping everything

`Ctrl+C` in both terminal windows (backend and frontend).  
No database containers or background daemons to shut down.
