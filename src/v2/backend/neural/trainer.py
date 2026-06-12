"""
neural/trainer.py — Training loop with TrainingGuard and progress callbacks.

The train() coroutine accepts a progress_callback so the API layer can
forward epoch results to WebSocket clients without this module knowing
anything about HTTP or WebSockets.
"""

from __future__ import annotations

import logging
from typing import Callable

import numpy as np
import torch
import torch.nn as nn

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


# ── Training loop ──────────────────────────────────────────────────────────────

async def train(
    model: nn.Module,
    train_loader,
    test_loader,
    epochs: int,
    lr: float,
    device: torch.device,
    guard: TrainingGuard,
    progress_cb: Callable[[int, float, float, str], None] | None = None,
) -> str:
    """
    Run the autoencoder training loop.

    Parameters
    ----------
    model        : ConvAutoencoder in training mode.
    train_loader : Training DataLoader.
    test_loader  : Validation DataLoader.
    epochs       : Maximum number of epochs.
    lr           : Learning rate.
    device       : torch.device.
    guard        : TrainingGuard instance.
    progress_cb  : Async callable(epoch, train_loss, val_loss, guard_status).
                   Called after every epoch.

    Returns
    -------
    Stop reason string (from guard or "completed").
    """
    model.to(device)
    model.train()
    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    for epoch in range(1, epochs + 1):
        # ── Training pass ───────────────────────────────────────────────────
        model.train()
        train_loss = 0.0
        for batch in train_loader:
            batch = batch.to(device)
            optimizer.zero_grad()
            recon = model(batch)
            loss  = criterion(recon, batch)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * len(batch)
        train_loss /= len(train_loader.dataset)

        # ── Validation pass ─────────────────────────────────────────────────
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for batch in test_loader:
                batch = batch.to(device)
                recon = model(batch)
                val_loss += criterion(recon, batch).item() * len(batch)
        val_loss /= len(test_loader.dataset)

        status = guard.status_str(epoch, train_loss, val_loss)
        logger.info(status)

        if progress_cb:
            await progress_cb(epoch, train_loss, val_loss, guard.stop_reason or "ok")

        if guard.check(epoch, train_loss, val_loss):
            logger.info("Early stop: %s", guard.stop_reason)
            return guard.stop_reason or "stopped"

    return "completed"
