"""api/infer.py — POST /api/infer, GET /api/infer/results."""

import asyncio
import logging
from typing import Optional

import numpy as np
import pandas as pd
import torch
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from neural.inference import walk_forward
from services import alpaca, config_manager, storage
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
    mode: str = "walkforward"


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


async def _run_live_inference(req: InferRequest) -> None:
    global _cancel_event
    _cancel_event = asyncio.Event()
    _state.update({"state": "running", "results": [], "error": None})

    cfg         = config_manager.load()
    symbol      = req.symbol    or cfg["symbol"]
    timeframe   = req.timeframe or cfg["timeframe"]
    window_size = cfg["window_size"]
    latent_dim  = cfg["latent_dim"]
    feat_cols   = config_manager.feature_cols()
    device      = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model  = storage.load_model(len(feat_cols), latent_dim, device)
    scaler = storage.load_scaler()
    kmeans = storage.load_kmeans()
    model.eval()

    last_ts = None
    try:
        while not _cancel_event.is_set():
            raw_bars = await alpaca.fetch_latest_bars(symbol, timeframe, window_size + 250)

            if len(raw_bars) >= window_size:
                df = pd.DataFrame(raw_bars)
                df = df.rename(columns={"t": "timestamp", "o": "open", "h": "high",
                                        "l": "low", "c": "close", "v": "volume"})
                df["timestamp"] = pd.to_datetime(df["timestamp"])
                df = storage.clean_data(df)
                df = storage.add_features(df)
                df = storage.drop_feature_nans(df)
                df, _ = storage.scale_features(df, feat_cols, scaler)

                if len(df) >= window_size:
                    current_ts = str(df["timestamp"].iloc[-1])
                    if current_ts != last_ts:
                        last_ts    = current_ts
                        window_np  = df[feat_cols].iloc[-window_size:].to_numpy(dtype=np.float32)
                        window_t   = torch.tensor(window_np).T.unsqueeze(0).to(device)
                        with torch.no_grad():
                            z_t     = model.encoder(window_t)
                            recon_t = model.decoder(z_t)
                        z     = z_t.cpu().numpy()[0]
                        recon = recon_t.cpu().numpy()[0].T
                        mse   = float(((window_np - recon) ** 2).mean())
                        label = int(kmeans.predict(z.reshape(1, -1))[0])
                        w_min, w_max = window_np.min(), window_np.max()
                        window_pixels = (
                            ((window_np.T - w_min) / (w_max - w_min + 1e-8) * 255)
                            .astype(np.uint8).tolist()
                        )
                        result = {
                            "timestamp":     current_ts,
                            "mse":           mse,
                            "cluster_label": label,
                            "latent_vector": z.tolist(),
                            "window_pixels": window_pixels,
                        }
                        _state["results"].append(result)
                        await manager.send("infer_step", result)

            # Wait 60 s but check cancel every second so Stop is responsive
            for _ in range(60):
                if _cancel_event.is_set():
                    break
                await asyncio.sleep(1)

    except Exception as exc:
        logger.exception("Live inference failed")
        _state.update({"state": "error", "error": str(exc)})
        await manager.send("error", {"message": str(exc)})
        return

    _state["state"] = "done"
    await manager.send("infer_complete", {"stop_reason": "cancelled"})


@router.post("")
def start_inference(req: InferRequest, background_tasks: BackgroundTasks) -> dict:
    if _state["state"] == "running":
        raise HTTPException(409, "Inference already running")
    _state["results"] = []
    if req.mode == "live":
        background_tasks.add_task(_run_live_inference, req)
    else:
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
