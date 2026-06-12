"""api/download.py — POST /api/download and GET /api/download/status."""

import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from api import status as status_api
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
