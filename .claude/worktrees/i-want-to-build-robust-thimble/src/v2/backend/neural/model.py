"""
neural/model.py — 1D CNN autoencoder architecture.

Contains only PyTorch model definitions — no API, WebSocket, or file I/O.
The same architecture as v1: proven to work on 14-channel, 64-bar windows.

Classes
-------
Encoder          : Conv1d stack → latent vector (batch, latent_dim)
Decoder          : latent vector → reconstructed window (batch, n_features, window_size)
ConvAutoencoder  : Encoder + Decoder combined
"""

from __future__ import annotations

import torch
import torch.nn as nn


class Encoder(nn.Module):
    """
    Compress a (batch, n_features, window_size) window to (batch, latent_dim).

    Architecture: 3× Conv1d+MaxPool halve the time axis each step:
      window_size → w/2 → w/4 → w/8
    Then flatten and project to latent_dim.
    """

    def __init__(self, n_features: int, latent_dim: int) -> None:
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv1d(n_features, 32, kernel_size=3, padding=1), nn.ReLU(), nn.MaxPool1d(2),
            nn.Conv1d(32, 64, kernel_size=3, padding=1),          nn.ReLU(), nn.MaxPool1d(2),
            nn.Conv1d(64, 128, kernel_size=3, padding=1),         nn.ReLU(), nn.MaxPool1d(2),
        )
        # After 3 pooling steps: window_size=64 → 8; channels=128
        self.fc = nn.Linear(128 * 8, latent_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.fc(self.conv(x).flatten(1))


class Decoder(nn.Module):
    """
    Reconstruct (batch, n_features, window_size) from (batch, latent_dim).

    Mirror of Encoder: Linear → reshape → 3× ConvTranspose1d upsample.
    """

    def __init__(self, n_features: int, latent_dim: int) -> None:
        super().__init__()
        self.fc = nn.Linear(latent_dim, 128 * 8)
        self.deconv = nn.Sequential(
            nn.ConvTranspose1d(128, 64, kernel_size=4, stride=2, padding=1),   # 8→16
            nn.ReLU(),
            nn.ConvTranspose1d(64, 32, kernel_size=4, stride=2, padding=1),    # 16→32
            nn.ReLU(),
            nn.ConvTranspose1d(32, n_features, kernel_size=4, stride=2, padding=1),  # 32→64
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        h = self.fc(z).view(z.size(0), 128, 8)
        return self.deconv(h)


class ConvAutoencoder(nn.Module):
    """Full autoencoder: Encoder followed by Decoder."""

    def __init__(self, n_features: int, latent_dim: int) -> None:
        super().__init__()
        self.encoder = Encoder(n_features, latent_dim)
        self.decoder = Decoder(n_features, latent_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.decoder(self.encoder(x))
