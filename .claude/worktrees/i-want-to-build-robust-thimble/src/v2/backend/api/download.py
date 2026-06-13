"""api/download.py — POST /api/download, GET /api/download/status, GET /api/download/list."""

import asyncio
import csv
import logging
import os

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from api import status as status_api
from services import config_manager, storage
from services.downloader import BarDownloader
from websocket.live import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/download", tags=["download"])

_current: dict = {"state": "idle", "bars_fetched": 0, "path": None, "error": None}


class DownloadRequest(BaseModel):
    symbol: str
    timeframe: str
    start: str
    end: str


async def _run_download(req: DownloadRequest) -> None:
    _current.update({"state": "running", "bars_fetched": 0, "path": None, "error": None})
    status_api.set_state("downloading", "running")

    async def on_progress(bars_fetched: int, symbol: str) -> None:
        _current["bars_fetched"] = bars_fetched
        await manager.send("download_progress", {"bars_fetched": bars_fetched, "symbol": symbol})

    try:
        downloader = BarDownloader()
        path = await downloader.download(
            req.symbol, req.timeframe, req.start, req.end,
            progress_cb=on_progress,
        )
        _current.update({"state": "done", "path": path})
        status_api.set_state("downloading", "idle")
        await manager.send("download_progress", {
            "bars_fetched": _current["bars_fetched"],
            "symbol": req.symbol,
            "done": True,
            "path": path,
        })
    except Exception as exc:
        logger.exception("Download failed")
        _current.update({"state": "error", "error": str(exc)})
        status_api.set_state("downloading", "idle")
        await manager.send("error", {"message": str(exc)})


@router.post("")
def start_download(req: DownloadRequest, background_tasks: BackgroundTasks) -> dict:
    if _current["state"] == "running":
        raise HTTPException(409, "Download already in progress")
    background_tasks.add_task(_run_download, req)
    return {"status": "started"}


@router.get("/status")
def download_status() -> dict:
    return _current


@router.get("/list")
def list_downloads() -> list[dict]:
    """
    Scan downloads/ and return metadata for every CSV found.

    Each entry: { ticker, timeframe, start_date, end_date, rows, path }
    Dates are extracted from the CSV's timestamp column (first and last row).
    """
    base = config_manager.downloads_dir()
    results = []

    if not os.path.isdir(base):
        return results

    for ticker in sorted(os.listdir(base)):
        ticker_dir = os.path.join(base, ticker)
        if not os.path.isdir(ticker_dir):
            continue
        for fname in sorted(os.listdir(ticker_dir)):
            if not fname.endswith(".csv"):
                continue
            fpath = os.path.join(ticker_dir, fname)
            timeframe = fname[:-4]  # strip .csv
            try:
                with open(fpath, newline="") as fh:
                    reader = csv.DictReader(fh)
                    rows = list(reader)
                if not rows:
                    continue
                ts_col = "timestamp"
                start_ts = rows[0].get(ts_col, "")
                end_ts   = rows[-1].get(ts_col, "")
                # Timestamps are ISO 8601: "2024-06-12T13:30:00Z" — take date part only
                start_date = start_ts[:10] if start_ts else ""
                end_date   = end_ts[:10]   if end_ts   else ""
                results.append({
                    "ticker":     ticker,
                    "timeframe":  timeframe,
                    "start_date": start_date,
                    "end_date":   end_date,
                    "rows":       len(rows),
                    "path":       fpath,
                })
            except Exception:
                logger.exception("Failed to read %s", fpath)

    # Attach any associated named model bundles (matched by symbol + timeframe)
    all_models = storage.list_models()
    for entry in results:
        entry["models"] = [
            m for m in all_models
            if m.get("symbol", "").upper() == entry["ticker"].upper()
            and m.get("timeframe", "") == entry["timeframe"]
        ]

    return results


@router.delete("/list/{ticker}/{timeframe}")
def delete_download(ticker: str, timeframe: str) -> dict:
    """Delete downloads/{ticker}/{timeframe}.csv."""
    base = config_manager.downloads_dir()
    # Sanitise — no path traversal
    if ".." in ticker or ".." in timeframe or os.sep in ticker or os.sep in timeframe:
        raise HTTPException(400, "Invalid ticker or timeframe")
    fpath = os.path.join(base, ticker, f"{timeframe}.csv")
    if not os.path.isfile(fpath):
        raise HTTPException(404, f"{ticker}/{timeframe}.csv not found")
    try:
        os.remove(fpath)
        # Remove the ticker directory if now empty (ignoring hidden files)
        ticker_dir = os.path.join(base, ticker)
        remaining = [f for f in os.listdir(ticker_dir) if not f.startswith(".")]
        if not remaining:
            os.rmdir(ticker_dir)
    except OSError as exc:
        raise HTTPException(500, str(exc)) from exc
    return {"deleted": f"{ticker}/{timeframe}.csv"}
