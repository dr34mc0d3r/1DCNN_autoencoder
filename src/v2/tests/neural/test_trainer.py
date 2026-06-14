"""tests/neural/test_trainer.py"""

import asyncio

import numpy as np
import pytest
import torch

from neural.trainer import TrainingGuard, train
from neural.model import ConvAutoencoder
from neural.dataset import make_dataloaders


N_FEAT, LATENT, WIN = 14, 8, 64


def _tiny_loaders():
    rng = np.random.default_rng(0)
    X = rng.random((40, WIN, N_FEAT)).astype(np.float32)
    return make_dataloaders(X, test_split=0.2, batch_size=8)


class TestTrainingGuard:
    def setup_method(self):
        self.guard = TrainingGuard(patience=3, min_delta=0.01)

    def test_no_stop_on_improvement(self):
        for e, loss in enumerate([1.0, 0.9, 0.8, 0.7]):
            stopped = self.guard.check(e, loss, loss * 0.9)
        assert not stopped

    def test_plateau_triggers_stop(self):
        guard = TrainingGuard(patience=3, min_delta=0.001)
        for e in range(5):
            stopped = guard.check(e, 0.5, 0.5)
        assert stopped

    def test_stop_reason_is_set_on_stop(self):
        guard = TrainingGuard(patience=2, min_delta=0.001)
        guard.check(0, 0.5, 0.5)
        guard.check(1, 0.5, 0.5)
        guard.check(2, 0.5, 0.5)
        assert guard.stop_reason is not None

    def test_status_str_returns_string(self):
        self.guard.check(0, 1.0, 0.9)
        assert isinstance(self.guard.status_str(0, 1.0, 0.9), str)

    def test_nan_loss_triggers_stop(self):
        guard = TrainingGuard()
        stopped = guard.check(0, float("nan"), float("nan"))
        assert stopped


@pytest.mark.asyncio
async def test_train_runs_two_epochs():
    model = ConvAutoencoder(N_FEAT, LATENT)
    train_dl, test_dl = _tiny_loaders()
    device = torch.device("cpu")
    guard  = TrainingGuard(patience=50)
    epochs_seen = []

    async def cb(epoch, tl, vl, gs, lr):
        epochs_seen.append(epoch)

    result = await train(model, train_dl, test_dl, epochs=2, lr=1e-3,
                         device=device, guard=guard, progress_cb=cb)
    assert len(epochs_seen) == 2
    assert result["stop_reason"] is not None


@pytest.mark.asyncio
async def test_train_returns_result_dict():
    model = ConvAutoencoder(N_FEAT, LATENT)
    train_dl, test_dl = _tiny_loaders()
    device = torch.device("cpu")
    result = await train(model, train_dl, test_dl, epochs=1, lr=1e-3,
                         device=device, guard=TrainingGuard())
    assert isinstance(result, dict)
    assert "stop_reason" in result
    assert "epochs_trained" in result
    assert "final_train_loss" in result
    assert "final_val_loss" in result
    assert "best_val_loss" in result
    assert "final_lr" in result
