"""api/train.py — POST /api/train, POST /api/train/stop, GET /api/train/status."""

import asyncio
import logging

import torch
from fastapi import APIRouter, BackgroundTasks, HTTPException

from api import status as status_api
from neural import dataset as ds
from neural.model import ConvAutoencoder
from neural.trainer import TrainingGuard, train
from services import config_manager, storage
from websocket.live import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/train", tags=["train"])

_state: dict = {
    "state": "idle",
    "epoch": 0,
    "train_loss": None,
    "val_loss": None,
    "stop_reason": None,
    "error": None,
}
_cancel_event: asyncio.Event | None = None


async def _run_training() -> None:
    global _cancel_event
    _cancel_event = asyncio.Event()

    cfg         = config_manager.load()
    feat_cols   = config_manager.feature_cols()
    device      = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    window_size = cfg["window_size"]
    latent_dim  = cfg["latent_dim"]

    _state.update({"state": "running", "epoch": 0, "train_loss": None,
                   "val_loss": None, "stop_reason": None, "error": None})
    status_api.set_state("training", "running")

    try:
        X_clean, _, scaler = storage.run_pipeline()
        train_loader, test_loader = ds.make_dataloaders(
            X_clean, cfg["test_split"], cfg["batch_size"]
        )

        model = ConvAutoencoder(len(feat_cols), latent_dim)
        guard = TrainingGuard(
            patience          = cfg["guard_patience"],
            min_delta         = cfg["guard_min_delta"],
            overfit_ratio     = cfg["guard_overfit_ratio"],
            explosion_factor  = cfg["guard_explosion_factor"],
            oscillation_window= cfg["guard_oscillation_window"],
            oscillation_cv    = cfg["guard_oscillation_cv"],
            collapse_threshold= cfg["guard_collapse_threshold"],
        )

        async def on_epoch(epoch: int, train_loss: float, val_loss: float, guard_status: str) -> None:
            _state.update({"epoch": epoch, "train_loss": train_loss, "val_loss": val_loss})
            await manager.send("training_epoch", {
                "epoch": epoch, "train_loss": train_loss,
                "val_loss": val_loss, "guard_status": guard_status,
            })
            if _cancel_event and _cancel_event.is_set():
                raise asyncio.CancelledError

        stop_reason = await train(
            model, train_loader, test_loader,
            epochs=cfg["epochs"], lr=cfg["lr"], device=device,
            guard=guard, progress_cb=on_epoch,
        )

        storage.save_model(model)
        storage.save_scaler(scaler)

        _state.update({"state": "done", "stop_reason": stop_reason})
        await manager.send("training_complete", {"stop_reason": stop_reason, "final_epoch": _state["epoch"]})

    except asyncio.CancelledError:
        _state.update({"state": "idle", "stop_reason": "cancelled"})
        await manager.send("training_complete", {"stop_reason": "cancelled", "final_epoch": _state["epoch"]})
    except Exception as exc:
        logger.exception("Training failed")
        _state.update({"state": "error", "error": str(exc)})
        await manager.send("error", {"message": str(exc)})
    finally:
        status_api.set_state("training", "idle")


@router.post("")
def start_training(background_tasks: BackgroundTasks) -> dict:
    if _state["state"] == "running":
        raise HTTPException(409, "Training already in progress")
    background_tasks.add_task(_run_training)
    return {"status": "started"}


@router.post("/stop")
def stop_training() -> dict:
    if _cancel_event:
        _cancel_event.set()
    return {"status": "stop_requested"}


@router.get("/status")
def training_status() -> dict:
    return _state
