"""
guard.py — Early-stopping guard for the autoencoder training loop.

TrainingGuard monitors six failure conditions each epoch:
  1. NaN or Inf loss         — weights exploded, training is broken
  2. Loss explosion          — loss is growing, LR is too high
  3. Reconstruction collapse — loss hit zero, decoder outputs the mean
  4. Overfitting             — val loss >> train loss
  5. Plateau                 — no improvement for N epochs in a row
  6. Oscillation             — loss bounces up and down (LR still too high)

Usage in a training loop:
    guard = TrainingGuard(patience=7, ...)
    for epoch in ...:
        # compute train_loss, val_loss
        print(guard.status(epoch, train_loss, val_loss))
        if guard.check(epoch, train_loss, val_loss):
            print(guard.stop_reason)
            break
"""

from __future__ import annotations

import numpy as np


class TrainingGuard:
    """
    Monitors six training failure conditions and signals when to stop early.

    Call guard.check(epoch, train_loss, val_loss) each epoch.
    Returns True when training should stop, and sets guard.stop_reason
    to a human-readable explanation including a suggested fix.

    Parameters
    ----------
    patience           : Stop after this many epochs with no val improvement.
    min_delta          : Improvement must exceed this value to count.
    overfit_ratio      : val_loss / train_loss above this signals overfitting.
    explosion_factor   : train_loss > initial × factor signals explosion.
    oscillation_window : Number of recent epochs to check for oscillation.
    oscillation_cv     : Coefficient of variation threshold (std/mean).
    collapse_threshold : train_loss below this signals collapse.
    """

    def __init__(
        self,
        patience: int            = 7,
        min_delta: float         = 1e-5,
        overfit_ratio: float     = 2.5,
        explosion_factor: float  = 10.0,
        oscillation_window: int  = 5,
        oscillation_cv: float    = 0.4,
        collapse_threshold: float = 1e-6,
    ):
        self.patience            = patience
        self.min_delta           = min_delta
        self.overfit_ratio       = overfit_ratio
        self.explosion_factor    = explosion_factor
        self.oscillation_window  = oscillation_window
        self.oscillation_cv      = oscillation_cv
        self.collapse_threshold  = collapse_threshold

        # Internal state — reset when training starts.
        self._best_val     = float("inf")
        self._no_improve   = 0
        self._initial_loss = None    # set on first check() call
        self._recent: list[float] = []
        self.stop_reason: str | None = None

    def check(self, epoch: int, train_loss: float, val_loss: float) -> bool:
        """
        Inspect the current epoch's losses and decide whether to stop.

        Returns True if training should stop; also sets self.stop_reason.
        Returns False if training should continue.
        """
        # Record the very first loss so we can detect relative explosion.
        if self._initial_loss is None:
            self._initial_loss = train_loss

        # Keep a rolling window of recent train losses for oscillation detection.
        self._recent.append(train_loss)
        if len(self._recent) > self.oscillation_window:
            self._recent.pop(0)   # remove oldest, keep window size constant

        # ── 1. NaN / Inf ──────────────────────────────────────────────────────
        # If either loss is not a finite number, weights are already broken.
        # There is no point continuing — all future values will also be NaN.
        if not np.isfinite(train_loss) or not np.isfinite(val_loss):
            self.stop_reason = (
                f"[Epoch {epoch}] STOP: NaN/Inf loss  "
                f"(train={train_loss}  val={val_loss})\n"
                "  Why:  gradients exploded — a bad batch drove weights to +-infinity.\n"
                "  Fix:  lower LR by 10×; add clip_grad_norm_(model.parameters(), 1.0);\n"
                "        check for zero-volume or extreme-outlier bars in the data."
            )
            return True

        # ── 2. Loss explosion ──────────────────────────────────────────────────
        # If the train loss is many times larger than it was at epoch 1,
        # the model is diverging — LR is too high.
        if train_loss > self._initial_loss * self.explosion_factor:
            self.stop_reason = (
                f"[Epoch {epoch}] STOP: Loss exploded  "
                f"({train_loss:.5f} > {self._initial_loss:.5f} × {self.explosion_factor})\n"
                "  Why:  LR too high — each update overshoots the loss minimum.\n"
                "  Fix:  divide LR by 10 and restart training from scratch."
            )
            return True

        # ── 3. Reconstruction collapse ─────────────────────────────────────────
        # If loss dropped to near zero very fast, the decoder found a shortcut:
        # outputting the average of all training windows gives low MSE but
        # captures no real market patterns.
        if train_loss < self.collapse_threshold:
            self.stop_reason = (
                f"[Epoch {epoch}] STOP: Reconstruction collapse  "
                f"(loss={train_loss:.2e} < {self.collapse_threshold:.0e})\n"
                "  Why:  decoder outputs the mean of all windows — trivially low MSE.\n"
                "  Fix:  visualise reconstructions to confirm; add input noise:\n"
                "        x + 0.01 * torch.randn_like(x)  before passing to the model."
            )
            return True

        # ── 4. Overfitting ─────────────────────────────────────────────────────
        # If val loss is much higher than train loss, the model memorised the
        # training windows instead of learning general patterns.
        if train_loss > 0 and (val_loss / train_loss) > self.overfit_ratio:
            self.stop_reason = (
                f"[Epoch {epoch}] WARN: Overfitting  "
                f"(val/train = {val_loss / train_loss:.2f} > {self.overfit_ratio})\n"
                "  Why:  model memorised training windows, not general market patterns.\n"
                "  Fix:  add nn.Dropout(0.2) after encoder ReLUs;\n"
                "        or reduce LATENT_DIM to increase the bottleneck pressure."
            )
            return True

        # ── 5. No improvement (plateau) ────────────────────────────────────────
        # Track the best validation loss seen so far.  If it hasn't improved
        # by at least min_delta for `patience` consecutive epochs, we're done.
        if val_loss < self._best_val - self.min_delta:
            self._best_val   = val_loss
            self._no_improve = 0   # reset the counter on any improvement
        else:
            self._no_improve += 1
            if self._no_improve >= self.patience:
                self.stop_reason = (
                    f"[Epoch {epoch}] STOP: Plateau  "
                    f"(no improvement for {self.patience} epochs, "
                    f"best val={self._best_val:.5f})\n"
                    "  Why:  model has converged — more epochs won't help.\n"
                    "  Fix:  this is the normal healthy outcome. "
                    "Save the model and move on."
                )
                return True

        # ── 6. Oscillation ─────────────────────────────────────────────────────
        # If the coefficient of variation (std / mean) of recent losses is high,
        # the loss is bouncing up and down rather than declining smoothly.
        if len(self._recent) == self.oscillation_window:
            mean = np.mean(self._recent)
            std  = np.std(self._recent)
            cv   = std / mean if mean > 0 else 0.0
            if cv > self.oscillation_cv:
                self.stop_reason = (
                    f"[Epoch {epoch}] WARN: Oscillating  "
                    f"(CV={cv:.2f} > {self.oscillation_cv}  "
                    f"over last {self.oscillation_window} epochs)\n"
                    f"  Recent losses: {[f'{v:.4f}' for v in self._recent]}\n"
                    "  Why:  LR overshooting the minimum each step.\n"
                    "  Fix:  divide LR by 3 and restart training."
                )
                return True

        return False

    def status(self, epoch: int, train_loss: float, val_loss: float, epochs: int = 0) -> str:
        """
        Return a one-line training status string for printing each epoch.

        Shows train/val loss, the overfit ratio, and a patience progress bar.

        Parameters
        ----------
        epoch      : Current epoch number.
        train_loss : Training loss for this epoch.
        val_loss   : Validation loss for this epoch.
        epochs     : Total number of planned epochs (used in the epoch/total display).
        """
        ratio  = val_loss / train_loss if train_loss > 0 else float("inf")
        filled = "#" * self._no_improve
        empty  = "-" * max(0, self.patience - self._no_improve)
        total  = f"/{epochs}" if epochs else ""
        return (
            f"  Epoch {epoch:>4}{total}  |  "
            f"train={train_loss:.5f}  val={val_loss:.5f}  |  "
            f"overfit={ratio:.2f}×  |  patience [{filled}{empty}]"
        )
