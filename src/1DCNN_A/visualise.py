"""
visualise.py — Window rendering helpers for the three visualisation notebooks.

All three notebooks (contact_sheet, heat_map, thumbnail_grid) share the same
sample-preparation step and then each calls its own draw function.

Functions
---------
prepare_sample   : Extract a random sample of windows and convert to uint8.
draw_contact_sheet : View A — each window as a small scaled block.
draw_heatmap       : View B — all windows stacked into one wide heatmap strip.
draw_thumbnail_grid: View C — each window shrunk to a tiny square thumbnail.

Import in a notebook:
    from visualise import prepare_sample, draw_contact_sheet, draw_heatmap, draw_thumbnail_grid
"""

from __future__ import annotations

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.figure
from PIL import Image


# ── prepare_sample ────────────────────────────────────────────────────────────

def prepare_sample(
    X_clean: np.ndarray,
    n_sample: int,
) -> tuple[np.ndarray, int, float, float]:
    """
    Take the first `n_sample` windows and convert them to 8-bit grayscale.

    Why uint8?
    ----------
    The visualisation code builds pixel images.  Pixel values must be integers
    in the range [0, 255].  The feature values in X_clean are floating-point
    numbers with a very different range after RobustScaler, so we map them to
    [0, 255] using percentile clipping.

    Why percentile clipping (p2 / p98)?
    ------------------------------------
    Using the absolute min and max would let a single extreme outlier (e.g. a
    flash crash spike) compress all other values into a tiny dark band.
    Using the 2nd and 98th percentiles as the clip boundaries means outliers are
    clamped to black or white, and the bulk of the data uses the full [0, 255]
    range.

    Parameters
    ----------
    X_clean  : Clean window array, shape (N, window_size, n_features).
    n_sample : How many windows to take (from the start of X_clean).
               If X_clean has fewer rows than n_sample, all rows are used.

    Returns
    -------
    (sample_u8, n_sample, lo, hi)
      sample_u8 : np.ndarray uint8, shape (n_sample, window_size, n_features).
      n_sample  : Actual number of windows taken (may be less than requested).
      lo        : p2 clipping boundary (for display purposes).
      hi        : p98 clipping boundary.
    """
    # Clamp to what we actually have.
    n_sample = min(n_sample, len(X_clean))
    sample   = X_clean[:n_sample]    # (n_sample, window_size, n_features)

    # Percentile boundaries — computed across all values in the sample.
    lo = float(np.percentile(sample, 2))
    hi = float(np.percentile(sample, 98))

    # Clip, shift to start at 0, scale to [0, 255], convert to uint8.
    sample_clipped = np.clip(sample, lo, hi)
    sample_u8 = ((sample_clipped - lo) / (hi - lo) * 255).astype(np.uint8)

    print(f"prepare_sample: {n_sample:,} windows  |  p2={lo:.3f}  p98={hi:.3f}  →  [0, 255]")
    return sample_u8, n_sample, lo, hi


# ── draw_contact_sheet ────────────────────────────────────────────────────────

def draw_contact_sheet(
    sample_u8: np.ndarray,
    scale: int,
    grid_cols: int,
    gap_px: int,
    feature_cols: list[str],
    window_size: int,
) -> matplotlib.figure.Figure:
    """
    View A: render each window as a small scaled pixel block on a grey canvas.

    Each window is a (window_size × n_features) image.  With scale=4 each
    data point becomes a 4×4 pixel square, making individual windows large
    enough to inspect.  All windows are tiled left-to-right, top-to-bottom.

    Parameters
    ----------
    sample_u8  : uint8 window array from prepare_sample(),
                 shape (N, window_size, n_features).
    scale      : Pixel-repeat factor (e.g. 4 makes each data point 4×4 px).
    grid_cols  : Number of window columns per row in the contact sheet.
    gap_px     : Pixel gap between adjacent windows (for visual separation).
    feature_cols : List of feature column names (used in the figure title).
    window_size  : Number of bars per window (used in the figure title).

    Returns
    -------
    matplotlib Figure — call plt.show() in the notebook after receiving it.
    """
    n_sample = len(sample_u8)
    block_h  = window_size * scale
    block_w  = sample_u8.shape[2] * scale   # n_features * scale

    n_rows  = (n_sample + grid_cols - 1) // grid_cols   # ceiling division
    cell_h  = block_h + gap_px
    cell_w  = block_w + gap_px

    # Start with a mid-grey canvas so gaps are visible between blocks.
    canvas = np.full((n_rows * cell_h, grid_cols * cell_w), 64, dtype=np.uint8)

    for i, block in enumerate(sample_u8):
        row, col = divmod(i, grid_cols)
        # np.repeat duplicates each pixel along each axis to achieve the scale factor.
        scaled = np.repeat(np.repeat(block, scale, axis=0), scale, axis=1)
        # Place the scaled block into the canvas at the correct grid position.
        canvas[row * cell_h : row * cell_h + block_h,
               col * cell_w : col * cell_w + block_w] = scaled

    fig, ax = plt.subplots(figsize=(20, max(4, n_rows * cell_h / 50)))
    ax.imshow(canvas, cmap="gray", vmin=0, vmax=255, interpolation="nearest")
    ax.axis("off")
    ax.set_title(
        f"View A — Contact Sheet  |  {n_sample:,} windows  |  "
        f"{block_h}×{block_w} px each (scale={scale}×)  |  {grid_cols} per row",
        fontsize=10,
    )
    plt.tight_layout()
    return fig


# ── draw_heatmap ──────────────────────────────────────────────────────────────

def draw_heatmap(
    sample_u8: np.ndarray,
    feature_cols: list[str],
    window_size: int,
) -> matplotlib.figure.Figure:
    """
    View B: stack all windows into one wide heatmap strip.

    Each row in the heatmap is one window, unrolled: feature 0's 64 bars,
    then feature 1's 64 bars, etc.  This gives a total of
    n_features × window_size columns per row.

    Red vertical lines divide the feature channels so you can see where
    one feature ends and the next begins.  The x-axis labels each channel.

    This view is great for spotting systematic differences between features
    and seeing whether the model learns distinct patterns per channel.

    Parameters
    ----------
    sample_u8    : uint8 window array, shape (N, window_size, n_features).
    feature_cols : Feature column names for x-axis labels.
    window_size  : Number of bars per window.

    Returns
    -------
    matplotlib Figure.
    """
    n_sample = len(sample_u8)
    n_feat   = sample_u8.shape[2]   # number of features

    # Flatten each window from (window_size, n_features) → (window_size * n_features,).
    # Result shape: (N, window_size * n_features)
    strip = sample_u8.reshape(n_sample, -1)

    fig, ax = plt.subplots(figsize=(20, max(4, n_sample / 80)))
    img = ax.imshow(
        strip,
        cmap="gray",
        vmin=0, vmax=255,
        interpolation="nearest",
        aspect="auto",    # stretch to fill the axes regardless of row/column count
    )
    plt.colorbar(img, ax=ax, fraction=0.01, pad=0.01,
                 label="Scaled value  (0 = low,  255 = high)")

    # Red vertical lines at each feature-channel boundary.
    for f in range(n_feat):
        ax.axvline(x=f * window_size, color="red", linewidth=0.3, alpha=0.5)

    # Label each channel at its centre.
    ax.set_xticks([f * window_size + window_size // 2 for f in range(n_feat)])
    ax.set_xticklabels(feature_cols, rotation=90, fontsize=7)

    ax.set_xlabel("Feature channel  (each channel spans 64 bar positions)", fontsize=9)
    ax.set_ylabel("Window index  (top = earliest)", fontsize=9)
    ax.set_title(
        f"View B — Heatmap Strip  |  {n_sample:,} windows × "
        f"{strip.shape[1]} values  ({n_feat} features × {window_size} bars)",
        fontsize=10,
    )
    plt.tight_layout()
    return fig


# ── draw_thumbnail_grid ───────────────────────────────────────────────────────

def draw_thumbnail_grid(
    sample_u8: np.ndarray,
    thumb_px: int,
    grid_cols: int,
    feature_cols: list[str],
) -> matplotlib.figure.Figure:
    """
    View C: shrink every window to a tiny thumbnail and tile them in a grid.

    Each window (window_size × n_features pixels) is downscaled to a
    thumb_px × thumb_px square using Lanczos resampling.  The thumbnails
    are tiled left-to-right, top-to-bottom.

    At 10 px per thumbnail and 100 columns, 2 000 windows fit in a 200-pixel-
    wide image — you can see the entire dataset at once and spot macro clusters.

    Parameters
    ----------
    sample_u8  : uint8 window array, shape (N, window_size, n_features).
    thumb_px   : Width and height of each thumbnail in pixels (e.g. 10).
    grid_cols  : Number of thumbnail columns per row (e.g. 100).
    feature_cols : Feature names (used only in the figure title).

    Returns
    -------
    matplotlib Figure.
    """
    n_sample = len(sample_u8)

    # Resize each (window_size × n_features) block to (thumb_px × thumb_px).
    # Image.LANCZOS gives the best quality when downsampling.
    thumbs = np.stack([
        np.array(Image.fromarray(w, mode="L").resize((thumb_px, thumb_px), Image.LANCZOS))
        for w in sample_u8
    ])  # (N, thumb_px, thumb_px)

    n_rows = (n_sample + grid_cols - 1) // grid_cols
    canvas = np.zeros((n_rows * thumb_px, grid_cols * thumb_px), dtype=np.uint8)

    for i, thumb in enumerate(thumbs):
        row, col = divmod(i, grid_cols)
        canvas[row * thumb_px : (row + 1) * thumb_px,
               col * thumb_px : (col + 1) * thumb_px] = thumb

    fig, ax = plt.subplots(figsize=(20, max(4, n_rows * thumb_px / 40)))
    ax.imshow(canvas, cmap="gray", vmin=0, vmax=255, interpolation="nearest")
    ax.axis("off")
    ax.set_title(
        f"View C — Thumbnail Grid  |  {n_sample:,} windows  |  "
        f"{thumb_px}×{thumb_px} px each  |  {grid_cols} per row  |  {n_rows} rows",
        fontsize=10,
    )
    plt.tight_layout()
    return fig
