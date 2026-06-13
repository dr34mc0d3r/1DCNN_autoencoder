"""
neural/dataset.py — Dataset and DataLoader preparation for the autoencoder.

No API or WebSocket knowledge. Depends only on PyTorch and numpy.
"""

from __future__ import annotations

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset


class WindowDataset(Dataset):
    """Thin Dataset wrapper for sliding-window tensors (input = target)."""

    def __init__(self, X: torch.Tensor) -> None:
        self.X = X

    def __len__(self) -> int:
        return len(self.X)

    def __getitem__(self, idx: int) -> torch.Tensor:
        return self.X[idx]


def make_dataloaders(
    X_clean: np.ndarray,
    test_split: float,
    batch_size: int,
) -> tuple[DataLoader, DataLoader]:
    """
    Chronological train/test split, then wrap in DataLoaders.

    X_clean shape: (N, window_size, n_features) — channels-last from storage.
    Conv1d expects channels-first, so we permute to (N, n_features, window_size).

    Returns
    -------
    (train_loader, test_loader)
    """
    split = int(len(X_clean) * (1 - test_split))
    X_train = torch.tensor(X_clean[:split]).permute(0, 2, 1)
    X_test  = torch.tensor(X_clean[split:]).permute(0, 2, 1)

    train_loader = DataLoader(WindowDataset(X_train), batch_size=batch_size, shuffle=True,  num_workers=0)
    test_loader  = DataLoader(WindowDataset(X_test),  batch_size=batch_size, shuffle=False, num_workers=0)
    return train_loader, test_loader
