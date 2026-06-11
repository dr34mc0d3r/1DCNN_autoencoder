# REST API Endpoints

Base URL: `http://localhost:8000`
Interactive docs: `http://localhost:8000/docs`

---

## Bars (OHLCV)

### `GET /bars`
Fetch historical OHLCV bar data from Alpaca Markets.

| Parameter  | Type   | Required | Default | Description |
|------------|--------|----------|---------|-------------|
| `symbols`  | string | yes      | —       | Comma-separated ticker symbols, e.g. `AAPL,MSFT` |
| `timeframe`| string | no       | `1Day`  | Bar timeframe: `1Min`, `5Min`, `15Min`, `1Hour`, `1Day` |
| `start`    | string | yes      | —       | Start date ISO 8601, e.g. `2024-01-01` |
| `end`      | string | yes      | —       | End date ISO 8601, e.g. `2024-12-31` |
| `save_to`  | string | no       | —       | Storage destination: `db` or `csv` |

**CSV output path:** `data/<SYMBOL>/<timeframe>.csv`

**Example:**
```
GET /bars?symbols=AAPL&timeframe=1Day&start=2024-01-01&end=2024-12-31
GET /bars?symbols=AAPL,MSFT&timeframe=1Hour&start=2024-01-01&end=2024-01-31&save_to=csv
```

---

## News

### `GET /news`
Fetch news articles from Alpaca Markets.

| Parameter  | Type    | Required | Default | Description |
|------------|---------|----------|---------|-------------|
| `symbols`  | string  | yes      | —       | Comma-separated ticker symbols, e.g. `AAPL,MSFT` |
| `start`    | string  | yes      | —       | Start date ISO 8601, e.g. `2024-01-01` |
| `end`      | string  | yes      | —       | End date ISO 8601, e.g. `2024-12-31` |
| `limit`    | integer | no       | `50`    | Max articles to return (Alpaca max: 50 per page) |
| `save_to`  | string  | no       | —       | Storage destination: `db` or `csv` |

**CSV output path:** `data/news/<SYMBOLS>_<YYYYMMDD_HHMMSS>.csv`

**Example:**
```
GET /news?symbols=AAPL&start=2024-01-01&end=2024-12-31
GET /news?symbols=AAPL,TSLA&start=2024-01-01&end=2024-12-31&limit=50&save_to=db
```

---

## Storage Destinations

| `save_to` | Bars path | News path |
|-----------|-----------|-----------|
| `csv`     | `data/<SYMBOL>/<timeframe>.csv` | `data/news/<SYMBOLS>_<timestamp>.csv` |
| `db`      | `bars` table | `news_articles` table |
| _(omit)_  | Returns JSON only, nothing stored | Returns JSON only, nothing stored |
