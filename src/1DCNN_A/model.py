"""
model.py — PyTorch autoencoder architecture and DataLoader helpers.

Contains:
  - Encoder  : compresses a 64-bar window into a small latent vector
  - Decoder  : reconstructs the original window from the latent vector
  - ConvAutoencoder : Encoder + Decoder combined into one trainable model
  - WindowDataset   : thin Dataset wrapper so DataLoader can iterate windows
  - make_dataloaders : split X_clean into train/test DataLoaders
  - save_model       : save model weights to disk
  - load_model       : load model weights from disk
  - save_kmeans      : save the fitted K-Means model to disk
  - load_kmeans      : load the K-Means model saved by latent_cluster.ipynb

Import in a notebook:
    from model import ConvAutoencoder, make_dataloaders, save_model, load_model
    from model import save_kmeans, load_kmeans   # for inference
"""

from __future__ import annotations

import os

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader


# ── Encoder ───────────────────────────────────────────────────────────────────

class Encoder(nn.Module):
    """
    Compress a multi-feature window into a short latent vector.

    Architecture
    ------------
    Input shape: (batch, n_features, WINDOW_SIZE)   e.g. (256, 14, 64)

    Three Conv1d layers with MaxPool1d halve the time dimension each time:
      64 → 32 → 16 → 8 time steps

    The final 3-D feature map is flattened and passed through a Linear layer
    that produces the latent vector of size `latent_dim`.

    Think of it as: the encoder reads the full 64-bar market episode and
    summarises it into 32 numbers that capture the essential pattern.

    Parameters
    ----------
    n_features : Number of input channels (one per feature column).
    latent_dim : Size of the output latent vector.
    """

    def __init__(self, n_features: int, latent_dim: int):
        super().__init__()

        # Three 1-D convolutional layers, each followed by ReLU and MaxPool.
        # kernel_size=3, padding=1 keeps the time dimension stable before pooling.
        # Channel counts grow: n_features → 32 → 64 → 128 (more abstract features)
        self.conv = nn.Sequential(
            nn.Conv1d(n_features, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool1d(2),           # time steps: 64 → 32

            nn.Conv1d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool1d(2),           # time steps: 32 → 16

            nn.Conv1d(64, 128, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool1d(2),           # time steps: 16 → 8
        )

        # After conv: shape is (batch, 128, 8)
        # Flatten to (batch, 1024), then project to latent_dim.
        self.fc = nn.Linear(128 * 8, latent_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Run through conv stack, flatten, then linear projection.
        h = self.conv(x).flatten(1)   # (batch, 128*8)
        return self.fc(h)             # (batch, latent_dim)


# ── Decoder ───────────────────────────────────────────────────────────────────

class Decoder(nn.Module):
    """
    Reconstruct a window from its latent vector.

    This is the mirror image of the Encoder.  ConvTranspose1d (sometimes called
    a 'deconvolution') increases the time dimension at each step.

    Architecture
    ------------
    Input:  latent vector (batch, latent_dim)
    Output: reconstructed window (batch, n_features, WINDOW_SIZE)

    Steps:
      Linear(latent_dim → 128*8) → reshape (batch, 128, 8)
      ConvTranspose1d: 8 → 16 → 32 → 64 time steps

    Parameters
    ----------
    n_features : Number of output channels (same as Encoder input).
    latent_dim : Size of the input latent vector.
    """

    def __init__(self, n_features: int, latent_dim: int):
        super().__init__()

        # Project the latent vector back up to the shape the deconv stack expects.
        self.fc = nn.Linear(latent_dim, 128 * 8)

        # Three transposed conv layers upsample the time dimension:
        # stride=2 doubles time steps; kernel=4, padding=1 keeps arithmetic clean.
        # Channel counts shrink: 128 → 64 → 32 → n_features (back to original)
        self.deconv = nn.Sequential(
            nn.ConvTranspose1d(128, 64, kernel_size=4, stride=2, padding=1),  # 8 → 16
            nn.ReLU(),
            nn.ConvTranspose1d(64, 32, kernel_size=4, stride=2, padding=1),   # 16 → 32
            nn.ReLU(),
            nn.ConvTranspose1d(32, n_features, kernel_size=4, stride=2, padding=1),  # 32 → 64
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        # Expand latent vector, reshape to 3-D, then deconvolve.
        h = self.fc(z).view(z.size(0), 128, 8)  # (batch, 128, 8)
        return self.deconv(h)                    # (batch, n_features, 64)


# ── ConvAutoencoder ───────────────────────────────────────────────────────────

class ConvAutoencoder(nn.Module):
    """
    Full 1D CNN autoencoder: Encoder followed by Decoder.

    Training objective: the output should match the input as closely as possible
    (measured by MSE loss).  No labels needed — this is unsupervised learning.

    After training, the Encoder half alone is used to extract the latent
    representation of each window for clustering and analysis.

    Parameters
    ----------
    n_features : Number of feature channels (e.g. 14).
    latent_dim : Size of the bottleneck latent space (e.g. 32).
    """

    def __init__(self, n_features: int, latent_dim: int):
        super().__init__()
        self.encoder = Encoder(n_features, latent_dim)
        self.decoder = Decoder(n_features, latent_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Encode to latent, then decode back to original shape.
        z = self.encoder(x)
        return self.decoder(z)


# ── WindowDataset ─────────────────────────────────────────────────────────────

class WindowDataset(Dataset):
    """
    Thin wrapper that lets PyTorch's DataLoader iterate over window tensors.

    PyTorch's DataLoader needs an object that:
      1. Reports how many samples it has (__len__).
      2. Returns one sample by index (__getitem__).

    For an autoencoder the input IS the target (we're reconstructing the input),
    so __getitem__ just returns the window itself.

    Parameters
    ----------
    X : torch.Tensor of shape (N, n_features, WINDOW_SIZE).
    """

    def __init__(self, X: torch.Tensor):
        self.X = X

    def __len__(self) -> int:
        return len(self.X)

    def __getitem__(self, idx: int) -> torch.Tensor:
        return self.X[idx]


# ── make_dataloaders ──────────────────────────────────────────────────────────

def make_dataloaders(
    X_clean: np.ndarray,
    test_split: float,
    batch_size: int,
) -> tuple[DataLoader, DataLoader]:
    """
    Split X_clean into train/test and wrap each in a DataLoader.

    The split is chronological (not random): the first (1 - test_split)
    fraction is used for training, the remainder for validation.  This
    avoids look-ahead bias — the model never sees future data during training.

    Conv1d expects channels-first tensors: (batch, n_features, window_size).
    X_clean is (N, window_size, n_features), so we permute axes 1 and 2.

    Parameters
    ----------
    X_clean    : Clean window array from filter_gap_windows(), shape
                 (N, window_size, n_features).
    test_split : Fraction of data to hold out for validation (e.g. 0.2 = 20%).
    batch_size : Number of windows per training step (e.g. 256).

    Returns
    -------
    (train_loader, test_loader) — ready to iterate in a training loop.
    """
    # Chronological split index.
    split = int(len(X_clean) * (1 - test_split))
    X_train_np, X_test_np = X_clean[:split], X_clean[split:]

    # Convert to tensors and permute to channels-first for Conv1d.
    X_train_t = torch.tensor(X_train_np).permute(0, 2, 1)  # (N_train, n_features, window_size)
    X_test_t  = torch.tensor(X_test_np).permute(0, 2, 1)   # (N_test,  n_features, window_size)

    train_loader = DataLoader(
        WindowDataset(X_train_t),
        batch_size=batch_size,
        shuffle=True,    # shuffle within each epoch to avoid order bias
        num_workers=0,   # 0 = data loaded in the main process (safest on macOS)
    )
    test_loader = DataLoader(
        WindowDataset(X_test_t),
        batch_size=batch_size,
        shuffle=False,   # keep validation in order for reproducible results
        num_workers=0,
    )

    print(f"make_dataloaders: train={X_train_t.shape}  test={X_test_t.shape}")
    print(f"  Batches — train: {len(train_loader)}  test: {len(test_loader)}")
    return train_loader, test_loader


# ── save_model ────────────────────────────────────────────────────────────────

def save_model(
    model: ConvAutoencoder,
    data_dir: str,
    symbol: str,
) -> str:
    """
    Save the model's learned weights to disk.

    We save state_dict() (just the weight tensors) rather than the whole
    model object.  This is the recommended PyTorch approach:
      - Smaller file (no code, just numbers).
      - Works even if you later rename a class or change Python version.

    The file is written to:  data_dir / symbol / model.pt

    Parameters
    ----------
    model    : Trained ConvAutoencoder.
    data_dir : Root data directory.
    symbol   : Ticker symbol (used as a subdirectory name).

    Returns
    -------
    Path string where the file was saved.
    """
    save_dir = os.path.join(data_dir, symbol)
    os.makedirs(save_dir, exist_ok=True)   # create the directory if it doesn't exist

    model_path = os.path.join(save_dir, "model.pt")
    torch.save(model.state_dict(), model_path)
    print(f"Model saved → {model_path}")
    return model_path


# ── load_model ────────────────────────────────────────────────────────────────

def load_model(
    data_dir: str,
    symbol: str,
    n_features: int,
    latent_dim: int,
    device: torch.device,
) -> ConvAutoencoder:
    """
    Load a previously saved model from disk.

    Reconstructs a ConvAutoencoder with the same architecture used during
    training, then loads the saved weights into it.

    You must pass the same n_features and latent_dim that were used when the
    model was trained, otherwise the weight shapes won't match.

    Parameters
    ----------
    data_dir   : Root data directory (same as used in save_model).
    symbol     : Ticker symbol.
    n_features : Number of feature channels (e.g. 14).
    latent_dim : Latent space size (e.g. 32).
    device     : torch.device to map the weights to ('cpu' or 'cuda').

    Returns
    -------
    ConvAutoencoder in eval mode, weights loaded from disk.
    """
    model_path = os.path.join(data_dir, symbol, "model.pt")

    # Build an empty model with the same shape as the one that was saved.
    model = ConvAutoencoder(n_features=n_features, latent_dim=latent_dim).to(device)

    # Load the weight tensors.  map_location ensures they land on the right device
    # even if the model was originally saved on a GPU.
    model.load_state_dict(torch.load(model_path, map_location=device))

    # eval() turns off Dropout and BatchNorm training behaviour (not used here,
    # but good practice before any inference or feature extraction).
    model.eval()

    print(f"Model loaded ← {model_path}  (device={device})")
    return model


# ── save_kmeans / load_kmeans ─────────────────────────────────────────────────

def save_kmeans(kmeans, data_dir: str, symbol: str) -> str:
    """
    Save a fitted scikit-learn KMeans model to disk.

    The K-Means model is fitted in latent_cluster.ipynb.  Saving it lets
    inference.ipynb assign cluster labels to new windows without re-fitting.

    The file is written to:  data_dir / symbol / kmeans.pkl

    Parameters
    ----------
    kmeans   : Fitted sklearn.cluster.KMeans instance.
    data_dir : Root data directory.
    symbol   : Ticker symbol (used as a subdirectory name).

    Returns
    -------
    Path string where the file was saved.
    """
    import joblib

    save_dir = os.path.join(data_dir, symbol)
    os.makedirs(save_dir, exist_ok=True)

    path = os.path.join(save_dir, "kmeans.pkl")
    joblib.dump(kmeans, path)
    print(f"K-Means saved → {path}")
    return path


def load_kmeans(data_dir: str, symbol: str):
    """
    Load the K-Means model saved by latent_cluster.ipynb.

    Once loaded, call kmeans.predict(z.reshape(1, -1)) to assign a cluster
    label to a single latent vector z.

    Parameters
    ----------
    data_dir : Root data directory.
    symbol   : Ticker symbol.

    Returns
    -------
    Fitted sklearn.cluster.KMeans instance.
    """
    import joblib

    path = os.path.join(data_dir, symbol, "kmeans.pkl")
    kmeans = joblib.load(path)
    print(f"K-Means loaded ← {path}  ({kmeans.n_clusters} clusters)")
    return kmeans
