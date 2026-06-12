"""api/train.py — POST /api/train, POST /api/train/stop, GET /api/train/status."""

import asyncio
import logging

import torch
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

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


async def _run_training(model_name: str) -> None:
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

        storage.save_named_model(model_name, model, scaler, cfg)

        _state.update({"state": "done", "stop_reason": stop_reason})
        await manager.send("training_complete", {
            "stop_reason": stop_reason,
            "final_epoch": _state["epoch"],
            "model_name":  model_name,
        })

    except asyncio.CancelledError:
        _state.update({"state": "idle", "stop_reason": "cancelled"})
        await manager.send("training_complete", {"stop_reason": "cancelled", "final_epoch": _state["epoch"]})
    except Exception as exc:
        logger.exception("Training failed")
        _state.update({"state": "error", "error": str(exc)})
        await manager.send("error", {"message": str(exc)})
    finally:
        status_api.set_state("training", "idle")


class TrainRequest(BaseModel):
    model_name: str


@router.post("")
def start_training(req: TrainRequest, background_tasks: BackgroundTasks) -> dict:
    if not req.model_name.strip():
        raise HTTPException(400, "model_name is required")
    if _state["state"] == "running":
        raise HTTPException(409, "Training already in progress")
    background_tasks.add_task(_run_training, req.model_name.strip())
    return {"status": "started"}


@router.post("/stop")
def stop_training() -> dict:
    if _cancel_event:
        _cancel_event.set()
    return {"status": "stop_requested"}


@router.get("/status")
def training_status() -> dict:
    return _state


@router.get("/data-preview")
def data_preview() -> dict:
    """
    Run the data pipeline and return a tabular preview for the Train page.

    Returns stats (window counts, split sizes) plus the first 20 rows of the
    training and test portions of the cleaned, scaled DataFrame.
    """
    cfg         = config_manager.load()
    feat_cols   = config_manager.feature_cols()
    test_split  = cfg["test_split"]
    window_size = cfg["window_size"]

    X_clean, df, _ = storage.run_pipeline()

    n_total = len(X_clean)
    split   = int(n_total * (1 - test_split))
    n_train = split
    n_test  = n_total - split

    columns = ["timestamp"] + feat_cols

    def df_to_rows(sub: object) -> list[dict]:
        rows = []
        for _, row in sub[columns].iterrows():
            record: dict = {}
            for col in columns:
                val = row[col]
                if hasattr(val, "isoformat"):
                    record[col] = str(val)[:19].replace("T", " ")
                else:
                    record[col] = round(float(val), 5)
            rows.append(record)
        return rows

    return {
        "stats": {
            "total_bars":     len(df),
            "total_windows":  n_total,
            "train_windows":  n_train,
            "test_windows":   n_test,
            "test_split_pct": round(test_split * 100, 1),
            "window_size":    window_size,
        },
        "columns":    columns,
        "train_rows": df_to_rows(df.iloc[:20]),
        "test_rows":  df_to_rows(df.iloc[split: split + 20]),
    }
