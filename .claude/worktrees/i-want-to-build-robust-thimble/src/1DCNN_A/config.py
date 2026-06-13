from __future__ import annotations
from dataclasses import dataclass, field
import os
from datetime import date
import torch


@dataclass
class Config:

    # ── Data ──────────────────────────────────────────────────────────────────
    SYMBOL:     str      = "TSLA"
    TIMEFRAME:  str      = "1Min"          # 1Min | 5Min | 1Hour | 1Day
    START_DATE: str      = "2017-01-01"
    END_DATE:   str      = field(default_factory=lambda: str(date.today()))
    DATA_DIR:   str      = field(default_factory=lambda: os.path.join("..", "..", "data"))
    API_BASE:   str      = "http://localhost:8000"
    FETCH_DATA: bool     = False           # True = re-pull from Alpaca
    MAX_BARS:   int|None = 2_000         # None = load all bars - int like 200_000

    # ── Windowing ─────────────────────────────────────────────────────────────
    WINDOW_SIZE:  int      = 64            # bars per input window
    feature_cols: list[str] = field(default_factory=lambda: [
        "close", "ema_9", "ema_21", "ema_50",
        "macd", "macd_9", "macd_hist",
        "body", "upper_wick", "lower_wick",
        "return", "vol_return", "log_return", "volume_ratio",
    ])

    # ── Autoencoder ───────────────────────────────────────────────────────────
    LATENT_DIM: int   = 32
    BATCH_SIZE: int   = 256
    EPOCHS:     int   = 10                 # increase to 30+ for a full run
    LR:         float = 1e-3
    TEST_SPLIT: float = 0.2

    # ── Training Guard ────────────────────────────────────────────────────────
    GUARD_PATIENCE:           int   = 7
    GUARD_MIN_DELTA:          float = 1e-5
    GUARD_OVERFIT_RATIO:      float = 2.5
    GUARD_EXPLOSION_FACTOR:   float = 10.0
    GUARD_OSCILLATION_WINDOW: int   = 5
    GUARD_OSCILLATION_CV:     float = 0.4
    GUARD_COLLAPSE_THRESHOLD: float = 1e-6

    # ── Clustering ────────────────────────────────────────────────────────────
    N_CLUSTERS:    int       = 8
    TSNE_SAMPLE:   int       = 10_000
    PLOT_FEATURES: list[str] = field(default_factory=lambda: [
        "close", "ema_9", "macd", "volume_ratio",
    ])

    # ── Visualisation (Section 9) ─────────────────────────────────────────────
    N_SAMPLE:    int = 2_000              # windows to render
    SCALE:       int = 4                  # pixel-repeat factor for View A (1 = natural)
    GRID_COLS_A: int = 50                 # columns in View A contact sheet
    GAP_PX:      int = 1                  # gap between blocks in View A (px)
    THUMB_PX:    int = 10                 # thumbnail size for View C (px)
    GRID_COLS_C: int = 100                # columns in View C thumbnail grid

    # ── Runtime (auto-detected) ───────────────────────────────────────────────
    DEVICE: torch.device = field(
        default_factory=lambda: torch.device("cuda" if torch.cuda.is_available() else "cpu")
    )
