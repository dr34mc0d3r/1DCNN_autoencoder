"""
neural/trainer.py — Training loop with TrainingGuard and progress callbacks.

The train() coroutine accepts a progress_callback so the API layer can
forward epoch results to WebSocket clients without this module knowing
anything about HTTP or WebSockets.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Callable

import numpy as np
import torch
import torch.nn as nn
from torch.optim.lr_scheduler import (
    CosineAnnealingLR, CyclicLR, ExponentialLR,
    LinearLR, MultiStepLR, ReduceLROnPlateau, StepLR,
)

logger = logging.getLogger(__name__)


# ── TrainingGuard ──────────────────────────────────────────────────────────────

class TrainingGuard:
    """
    Monitors 6 training failure conditions each epoch and signals early stop.

    Failure modes detected
    ----------------------
    1. NaN / Inf loss — weights exploded
    2. Loss explosion — LR too high
    3. Reconstruction collapse — decoder outputs the mean
    4. Overfitting — val_loss >> train_loss
    5. Plateau — no improvement for patience epochs
    6. Oscillation — loss bounces (LR still too high)
    """

    def __init__(
        self,
        patience: int = 7,
        min_delta: float = 1e-5,
        overfit_ratio: float = 2.5,
        explosion_factor: float = 10.0,
        oscillation_window: int = 5,
        oscillation_cv: float = 0.4,
        collapse_threshold: float = 1e-6,
    ) -> None:
        self.patience            = patience
        self.min_delta           = min_delta
        self.overfit_ratio       = overfit_ratio
        self.explosion_factor    = explosion_factor
        self.oscillation_window  = oscillation_window
        self.oscillation_cv      = oscillation_cv
        self.collapse_threshold  = collapse_threshold

        self._best_val     = float("inf")
        self._no_improve   = 0
        self._initial_loss: float | None = None
        self._recent: list[float] = []
        self.stop_reason: str | None = None

    def check(self, epoch: int, train_loss: float, val_loss: float) -> bool:
        if self._initial_loss is None:
            self._initial_loss = train_loss

        self._recent.append(train_loss)
        if len(self._recent) > self.oscillation_window:
            self._recent.pop(0)

        if not np.isfinite(train_loss) or not np.isfinite(val_loss):
            self.stop_reason = f"NaN/Inf loss at epoch {epoch}"
            return True

        if train_loss > self._initial_loss * self.explosion_factor:
            self.stop_reason = f"Loss exploded at epoch {epoch} ({train_loss:.5f})"
            return True

        if train_loss < self.collapse_threshold:
            self.stop_reason = f"Reconstruction collapse at epoch {epoch} (loss={train_loss:.2e})"
            return True

        if train_loss > 0 and (val_loss / train_loss) > self.overfit_ratio:
            self.stop_reason = f"Overfitting at epoch {epoch} (val/train={val_loss/train_loss:.2f})"
            return True

        if val_loss < self._best_val - self.min_delta:
            self._best_val   = val_loss
            self._no_improve = 0
        else:
            self._no_improve += 1
            if self._no_improve >= self.patience:
                self.stop_reason = f"Plateau at epoch {epoch} (no improvement for {self.patience} epochs)"
                return True

        if len(self._recent) == self.oscillation_window:
            mean = np.mean(self._recent)
            std  = np.std(self._recent)
            cv   = std / mean if mean > 0 else 0.0
            if cv > self.oscillation_cv:
                self.stop_reason = f"Oscillating at epoch {epoch} (CV={cv:.2f})"
                return True

        return False

    def status_str(self, epoch: int, train_loss: float, val_loss: float) -> str:
        ratio  = val_loss / train_loss if train_loss > 0 else float("inf")
        filled = "#" * self._no_improve
        empty  = "-" * max(0, self.patience - self._no_improve)
        return (
            f"Epoch {epoch:>4} | train={train_loss:.5f}  val={val_loss:.5f} | "
            f"overfit={ratio:.2f}× | patience [{filled}{empty}]"
        )


# ── LR scheduler factory ──────────────────────────────────────────────────────

def _make_scheduler(optimizer, cfg: dict):
    """Return a scheduler for optimizer based on cfg['scheduler'], or None."""
    name = cfg.get("scheduler", "none")
    if name == "plateau":
        return ReduceLROnPlateau(
            optimizer, mode="min",
            factor=float(cfg.get("scheduler_plateau_factor", 0.5)),
            patience=int(cfg.get("scheduler_plateau_patience", 5)),
            min_lr=float(cfg.get("scheduler_plateau_min_lr", 1e-7)),
        )
    if name == "step":
        return StepLR(
            optimizer,
            step_size=int(cfg.get("scheduler_step_size", 10)),
            gamma=float(cfg.get("scheduler_step_gamma", 0.5)),
        )
    if name == "multistep":
        milestones = [int(x) for x in str(cfg.get("scheduler_multistep_milestones", "20,40,60")).split(",")]
        return MultiStepLR(
            optimizer, milestones=milestones,
            gamma=float(cfg.get("scheduler_multistep_gamma", 0.5)),
        )
    if name == "cosine":
        return CosineAnnealingLR(
            optimizer,
            T_max=int(cfg.get("scheduler_cosine_t_max", 50)),
            eta_min=float(cfg.get("scheduler_cosine_eta_min", 1e-7)),
        )
    if name == "exponential":
        return ExponentialLR(optimizer, gamma=float(cfg.get("scheduler_exp_gamma", 0.95)))
    if name == "warmup":
        return LinearLR(
            optimizer,
            start_factor=float(cfg.get("scheduler_warmup_start_factor", 0.1)),
            end_factor=1.0,
            total_iters=int(cfg.get("scheduler_warmup_epochs", 5)),
        )
    if name == "cyclic":
        return CyclicLR(
            optimizer,
            base_lr=float(cfg.get("scheduler_cyclic_base_lr", 1e-5)),
            max_lr=float(cfg.get("scheduler_cyclic_max_lr", 1e-2)),
            step_size_up=int(cfg.get("scheduler_cyclic_step_size", 10)),
            mode=str(cfg.get("scheduler_cyclic_mode", "triangular2")),
            cycle_momentum=False,
        )
    return None


# ── Synchronous epoch helpers (run in thread pool) ─────────────────────────────

def _train_epoch(model, loader, criterion, optimizer, device) -> float:
    """One full training pass. Runs in a thread pool — must not call async code."""
    model.train()
    total = 0.0
    for batch in loader:
        if isinstance(batch, (list, tuple)):
            batch = batch[0]
        batch = batch.to(device)
        optimizer.zero_grad()
        recon = model(batch)
        loss  = criterion(recon, batch)
        loss.backward()
        optimizer.step()
        total += loss.item() * len(batch)
    return total / len(loader.dataset)


def _val_epoch(model, loader, criterion, device) -> float:
    """One full validation pass. Runs in a thread pool — must not call async code."""
    model.eval()
    total = 0.0
    with torch.no_grad():
        for batch in loader:
            if isinstance(batch, (list, tuple)):
                batch = batch[0]
            batch = batch.to(device)
            recon = model(batch)
            total += criterion(recon, batch).item() * len(batch)
    return total / len(loader.dataset)


# ── Training loop ──────────────────────────────────────────────────────────────

async def train(
    model: nn.Module,
    train_loader,
    test_loader,
    epochs: int,
    lr: float,
    device: torch.device,
    guard: TrainingGuard,
    progress_cb: Callable[[int, float, float, str, float], None] | None = None,
    scheduler_cfg: dict | None = None,
) -> str:
    """
    Run the autoencoder training loop.

    Each epoch's train and validation passes run in a thread pool executor so
    the asyncio event loop stays free to flush WebSocket messages between epochs.
    progress_cb is awaited after each epoch with (epoch, train_loss, val_loss, guard_status, lr).
    """
    model.to(device)
    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    scheduler = _make_scheduler(optimizer, scheduler_cfg or {})
    loop = asyncio.get_event_loop()

    for epoch in range(1, epochs + 1):
        # Run CPU-bound passes in a thread so the event loop can flush WS messages
        train_loss = await loop.run_in_executor(
            None, _train_epoch, model, train_loader, criterion, optimizer, device
        )
        val_loss = await loop.run_in_executor(
            None, _val_epoch, model, test_loader, criterion, device
        )

        if isinstance(scheduler, ReduceLROnPlateau):
            scheduler.step(val_loss)
        elif scheduler is not None:
            scheduler.step()
        current_lr = optimizer.param_groups[0]["lr"]

        status = guard.status_str(epoch, train_loss, val_loss)
        logger.info(status)

        if progress_cb:
            ok_str = "ok" if guard._no_improve == 0 else f"ok - {guard._no_improve}"
            await progress_cb(epoch, train_loss, val_loss, guard.stop_reason or ok_str, current_lr)

        if guard.check(epoch, train_loss, val_loss):
            logger.info("Early stop: %s", guard.stop_reason)
            return guard.stop_reason or "stopped"

    return "completed"
