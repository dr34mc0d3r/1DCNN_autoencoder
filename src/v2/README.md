# 1DCNN-A v2

React + FastAPI + PyTorch application for training and inspecting a 1D CNN autoencoder on stock market bar data.

## Architecture

```
src/v2/
├── backend/        FastAPI server (Python 3.12, uv)
│   ├── app.py      Application entry point
│   ├── api/        REST endpoints
│   ├── neural/     PyTorch model, trainer, inference, metrics
│   ├── services/   Alpaca client, storage, config manager
│   ├── websocket/  WebSocket connection manager
│   └── config/config.json   Persistent config (single source of truth)
├── frontend/       React + Vite + Recharts + Tailwind CSS v4
│   └── src/pages/  8 pages: Config, Download, Train, Latent Space,
│                             Cluster Profile, Windows, Analysis, Live Inference
└── tests/          pytest suite (one file per production module)
```

## Quickstart

### Backend

```bash
cd src/v2/backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Or with uv from the project root:

```bash
uv run uvicorn src.v2.backend.app:app --reload --port 8000
```

### Frontend

```bash
cd src/v2/frontend
npm install
npm run dev       # http://localhost:5173
```

### Tests

```bash
cd src/v2
pytest
```

## Workflow

1. **Config** — fill in Alpaca API key + model hyperparameters
2. **Download** — pull bar data; reuse or delete existing CSVs from the Available Downloads panel
3. **Train** — start training; preview pipeline data before running; watch loss curves live via WebSocket
4. **Latent Space** — extract latent vectors, cluster with K-Means, view t-SNE scatter and Clustering Report; run Cluster Quality to find optimal K
5. **Cluster Profile** — characterise each cluster: feature z-score fingerprints, decision tree rules, representative OHLCV windows, forward return distributions
6. **Windows** — browse raw training windows (contact sheet / heatmap / thumbnail views)
7. **Analysis** — reconstruction comparison; Hour-of-Day Heatmap; Cluster Frequency by Hour; Day-of-Week Distribution
8. **Live Inference** — walk-forward inference with real-time MSE timeline, cluster history, latent vector display; inline chart guide

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/config | Get current config |
| POST | /api/config | Update config |
| GET | /api/status | System health (model loaded, training state…) |
| POST | /api/download | Start bar download |
| GET | /api/download/status | Download state |
| GET | /api/download/list | List all downloaded CSVs with ticker, dates, and row count |
| DELETE | /api/download/list/{ticker}/{timeframe} | Delete a downloaded CSV (and empty ticker dir) |
| POST | /api/train | Start training |
| POST | /api/train/stop | Stop training |
| GET | /api/train/status | Training state + current loss |
| GET | /api/train/data-preview | Pipeline stats and first 20 rows of train/test splits |
| POST | /api/infer | Start walk-forward inference |
| POST | /api/infer/stop | Stop inference |
| GET | /api/infer/results | Completed inference results |
| POST | /api/cluster | Fit K-Means + t-SNE on all training windows; saves latent/label/window_mean/valid_index artifacts |
| GET | /api/cluster | Cluster result (scatter, centroids, labels) |
| GET | /api/cluster/quality | Silhouette/DB/CH scores for K=2..16 |
| GET | /api/cluster/profile | Feature z-score fingerprints + decision tree rules for all clusters |
| GET | /api/cluster/representatives | Top-N OHLCV windows closest to a cluster centroid |
| GET | /api/cluster/forward-returns | Non-overlapping forward return stats per cluster |
| GET | /api/windows | Sampled training windows as pixel arrays |
| POST | /api/reconstruct | Original vs reconstructed comparison |
| GET | /api/temporal | Cluster timeline + by-hour/weekday distributions |
| WS | /ws | WebSocket: all live events (epoch, infer_step, download_progress…) |

## Key Design Decisions

- **No MySQL**: CSV-only storage removes the database dependency entirely.
- **No Celery/Redis**: asyncio `BackgroundTasks` handles all async jobs.
- **No Axios/Redux**: native `fetch()` and a small `ws.js` singleton.
- **config.json as single source of truth**: no hardcoded defaults in modules.
- **WebSocket broadcasts everything**: frontend subscribes once; receives training epochs, inference steps, download progress, and heartbeats on one connection.
