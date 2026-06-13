"""api/infer.py — POST /api/infer, GET /api/infer/results."""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from neural.inference import walk_forward
from websocket.live import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/infer", tags=["infer"])

_state: dict = {"state": "idle", "results": [], "error": None}
_cancel_event: asyncio.Event | None = None


_SPEED_DELAYS: dict[str, float] = {"full": 0.0, "1s": 1.0, "5s": 5.0}


class InferRequest(BaseModel):
    symbol: Optional[str] = None
    timeframe: Optional[str] = None
    infer_start: Optional[str] = None
    infer_end: Optional[str] = None
    speed: str = "full"


async def _run_inference(req: InferRequest) -> None:
    global _cancel_event
    _cancel_event = asyncio.Event()
    _state.update({"state": "running", "results": [], "error": None})

    step_delay = _SPEED_DELAYS.get(req.speed, 0.0)
    try:
        async for result in walk_forward(
            symbol=req.symbol,
            timeframe=req.timeframe,
            infer_start=req.infer_start,
            infer_end=req.infer_end,
            step_delay=step_delay,
        ):
            if _cancel_event and _cancel_event.is_set():
                break
            _state["results"].append(result)
            await manager.send("infer_step", result)

        stop_reason = "cancelled" if (_cancel_event and _cancel_event.is_set()) else "completed"
        _state["state"] = "done"
        await manager.send("infer_complete", {"stop_reason": stop_reason})
    except Exception as exc:
        logger.exception("Inference failed")
        _state.update({"state": "error", "error": str(exc)})
        await manager.send("error", {"message": str(exc)})


@router.post("")
def start_inference(req: InferRequest, background_tasks: BackgroundTasks) -> dict:
    if _state["state"] == "running":
        raise HTTPException(409, "Inference already running")
    _state["results"] = []
    background_tasks.add_task(_run_inference, req)
    return {"status": "started"}


@router.post("/stop")
async def stop_inference() -> dict:
    if _cancel_event:
        _cancel_event.set()
    return {"status": "stop_requested"}


@router.get("/results")
def get_results() -> dict:
    return {"state": _state["state"], "count": len(_state["results"]), "results": _state["results"]}
