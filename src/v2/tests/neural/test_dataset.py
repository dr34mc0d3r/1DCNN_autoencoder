"""tests/neural/test_dataset.py"""

import numpy as np
import pytest
import torch

from neural.dataset import WindowDataset, make_dataloaders


def _fake_X(n=100, win=16, feat=14) -> np.ndarray:
    rng = np.random.default_rng(0)
    return rng.random((n, win, feat)).astype(np.float32)


def test_window_dataset_len():
    X = _fake_X(50)
    ds = WindowDataset(X)
    assert len(ds) == 50


def test_window_dataset_item_shape():
    X = _fake_X(50)
    ds = WindowDataset(X)
    x, y = ds[0]
    assert x.shape == (14, 16)  # channels-first
    assert y.shape == (14, 16)


def test_window_dataset_input_eq_target():
    X = _fake_X(20)
    ds = WindowDataset(X)
    x, y = ds[5]
    assert torch.equal(x, y)


def test_make_dataloaders_returns_two():
    X = _fake_X(100)
    train_dl, test_dl = make_dataloaders(X, test_split=0.2, batch_size=8)
    assert train_dl is not None
    assert test_dl is not None


def test_make_dataloaders_split_sizes():
    X = _fake_X(100)
    train_dl, test_dl = make_dataloaders(X, test_split=0.2, batch_size=4)
    n_train = sum(1 for _ in train_dl.dataset)
    n_test  = sum(1 for _ in test_dl.dataset)
    assert n_train == 80
    assert n_test  == 20


def test_make_dataloaders_batch_shape():
    X = _fake_X(50)
    train_dl, _ = make_dataloaders(X, test_split=0.2, batch_size=8)
    for batch_x, batch_y in train_dl:
        assert batch_x.shape[1] == 14  # features
        assert batch_x.shape[2] == 16  # window_size
        break
