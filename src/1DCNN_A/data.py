"""
data.py — Load, clean, and engineer features for the 1D CNN autoencoder.

This module handles everything that touches raw data:
  1. Load raw bars from a CSV file.
  2. Remove duplicates and rows with missing values.
  3. Calculate 14 technical indicator features.
  4. Normalise every feature column with RobustScaler.
  5. Slice the time series into overlapping WINDOW_SIZE-bar windows.
  6. Remove windows that cross an overnight or weekend gap.

Import this module in a notebook like:
    from data import load_bars, clean_data, add_features, scale_features, make_windows, filter_gap_windows
"""

from __future__ import annotations

import os

import numpy as np
import pandas as pd
from sklearn.preprocessing import RobustScaler


# ── 1. Load bars ─────────────────────────────────────────────────────────────

def load_bars(
    data_dir: str,
    symbol: str,
    timeframe: str,
    max_bars: int | None = None,
) -> pd.DataFrame:
    """
    Read OHLCV bars from a CSV file into a Pandas DataFrame.

    The CSV is expected to have a 'timestamp' column (parseable as a datetime)
    plus at least: open, high, low, close, volume.

    Parameters
    ----------
    data_dir  : Root data folder (e.g. '../../data').
    symbol    : Ticker symbol subdirectory name (e.g. 'TSLA').
    timeframe : File name prefix (e.g. '1Min' → reads '1Min.csv').
    max_bars  : Maximum number of rows to load. None means load everything.

    Returns
    -------
    pd.DataFrame sorted by timestamp, index reset to 0, 1, 2, …
    """
    # Build the path:  data_dir / SYMBOL / TIMEFRAME.csv
    csv_path = os.path.join(data_dir, symbol, f"{timeframe}.csv")

    # Read the file.  parse_dates converts the timestamp column from a string
    # to a proper Python datetime so we can do time arithmetic on it later.
    df = pd.read_csv(csv_path, parse_dates=["timestamp"], nrows=max_bars)

    # Sort oldest-first so windows are in chronological order.
    df = df.sort_values("timestamp").reset_index(drop=True)

    # Friendly summary so the notebook can confirm the right file loaded.
    max_bars_display = "all" if max_bars is None else f"{max_bars:,}"
    print(f"Loaded {len(df):,} bars  |  "
          f"{df['timestamp'].min()} → {df['timestamp'].max()}  |  "
          f"MAX_BARS={max_bars_display}")

    return df


# ── 2. Clean data ─────────────────────────────────────────────────────────────

def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Remove data quality problems before adding features.

    Steps:
      - Drop rows with duplicate timestamps (keeps the first occurrence).
      - Drop rows where any column is NaN (missing value).

    Parameters
    ----------
    df : Raw OHLCV DataFrame from load_bars().

    Returns
    -------
    Cleaned pd.DataFrame with index reset to 0, 1, 2, …
    """
    before = len(df)

    # Two rows with the same timestamp are almost always a data feed error.
    df = df.drop_duplicates(subset=["timestamp"])

    # Any NaN in OHLCV means a partial row — safest to drop it.
    df = df.dropna().reset_index(drop=True)

    removed = before - len(df)
    print(f"clean_data: removed {removed:,} rows  →  {len(df):,} remaining")

    return df


# ── 3. Add technical features ─────────────────────────────────────────────────

def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Append 14 technical-indicator columns to the DataFrame.

    Column descriptions
    -------------------
    ema_9 / ema_21 / ema_50
        Exponential moving averages — smoothed versions of the close price
        over 9, 21, and 50 bars respectively.  EMAs respond faster to recent
        price changes than a simple average.

    macd
        Difference between the 12-bar EMA and 26-bar EMA.  Positive = short-
        term trend above long-term (bullish momentum).

    macd_9
        9-bar EMA of the MACD line.  Acts as a signal line.

    macd_hist
        Histogram = MACD − signal.  Shows whether momentum is accelerating.

    body
        Close − open.  Positive = green candle; negative = red candle.

    upper_wick / lower_wick
        Distance from the candle body to the high/low.  Long wicks indicate
        rejection at a price level.

    return
        Percentage change in close from the previous bar.

    vol_return
        Percentage change in volume from the previous bar.

    log_return
        Natural log of close / prev_close.  Preferred in statistics because
        log-returns are additive and more normally distributed.

    volume_ratio
        Volume this bar divided by its 20-bar rolling average.  > 1 means
        above-average activity; < 1 means quiet.

    Parameters
    ----------
    df : Cleaned DataFrame (from clean_data).

    Returns
    -------
    pd.DataFrame with the new columns appended.  NaNs created by the rolling
    calculations are still present — call clean_data (or dropna) afterwards.
    """
    # ── Exponential Moving Averages ───────────────────────────────────────────
    # adjust=False uses the recursive EMA formula, consistent with most charting tools.
    df["ema_9"]  = df["close"].ewm(span=9,  adjust=False).mean()
    df["ema_21"] = df["close"].ewm(span=21, adjust=False).mean()
    df["ema_50"] = df["close"].ewm(span=50, adjust=False).mean()

    # ── MACD ─────────────────────────────────────────────────────────────────
    ema_12       = df["close"].ewm(span=12, adjust=False).mean()
    ema_26       = df["close"].ewm(span=26, adjust=False).mean()
    df["macd"]   = ema_12 - ema_26                              # MACD line
    df["macd_9"] = df["macd"].ewm(span=9, adjust=False).mean() # signal line
    df["macd_hist"] = df["macd"] - df["macd_9"]                 # histogram

    # ── Candle body and wicks ─────────────────────────────────────────────────
    df["body"]        = df["close"] - df["open"]
    df["upper_wick"]  = df["high"] - df[["open", "close"]].max(axis=1)
    df["lower_wick"]  = df[["open", "close"]].min(axis=1) - df["low"]

    # ── Returns ───────────────────────────────────────────────────────────────
    df["return"]       = df["close"].pct_change()                       # % change
    df["vol_return"]   = df["volume"].pct_change()                      # volume % change
    df["log_return"]   = np.log(df["close"] / df["close"].shift(1))     # log-return

    # ── Volume activity ───────────────────────────────────────────────────────
    # Dividing by the 20-bar average makes volume comparable across different
    # time periods when overall activity levels might differ.
    df["volume_ratio"] = df["volume"] / df["volume"].rolling(20).mean()

    print(f"add_features: appended 14 columns  →  {df.shape[1]} total columns")
    return df


# ── 4. Remove NaNs created by feature engineering ────────────────────────────

def drop_feature_nans(df: pd.DataFrame) -> pd.DataFrame:
    """
    Drop rows that have NaN in any column after feature engineering.

    The first 50 or so rows will have NaN because the EMAs and rolling means
    need a warm-up period.  This function removes them cleanly.

    Parameters
    ----------
    df : DataFrame after add_features().

    Returns
    -------
    pd.DataFrame with NaN rows removed and index reset.
    """
    before = len(df)
    df = df.dropna().reset_index(drop=True)
    print(f"drop_feature_nans: removed {before - len(df):,} warm-up rows  →  {len(df):,} remaining")
    return df


# ── 5. Scale features ─────────────────────────────────────────────────────────

def scale_features(
    df: pd.DataFrame,
    feature_cols: list[str],
) -> tuple[pd.DataFrame, RobustScaler]:
    """
    Normalise the feature columns so they're all in a similar numeric range.

    Why normalise?
    --------------
    A CNN mixes features in its convolutional kernels.  If one feature has
    values like 45000 (close price) and another has 0.001 (return), the large-
    valued feature will dominate and the model will struggle to learn anything
    useful from the small-valued one.

    Why RobustScaler?
    -----------------
    Financial data has extreme outliers (flash crashes, gap opens).
    RobustScaler subtracts the median and divides by the inter-quartile range
    (IQR), so outliers don't drag all other values into a tiny band the way
    StandardScaler's mean/std would.

    Parameters
    ----------
    df           : DataFrame after add_features() and drop_feature_nans().
    feature_cols : List of column names to scale (defined in Config).

    Returns
    -------
    (df, scaler) — modified DataFrame (feature columns replaced in-place)
                   and the fitted scaler (keep it if you need to inverse-transform
                   predictions back to real price units later).
    """
    scaler = RobustScaler()

    # fit_transform learns the median/IQR from the data, then applies the scaling.
    # We update the DataFrame columns directly — the non-feature columns are unchanged.
    df[feature_cols] = scaler.fit_transform(df[feature_cols])

    print(f"scale_features: {len(feature_cols)} columns normalised with RobustScaler")
    return df, scaler


# ── 6. Slice into overlapping windows ────────────────────────────────────────

def make_windows(
    df: pd.DataFrame,
    feature_cols: list[str],
    window_size: int,
) -> np.ndarray:
    """
    Convert the time series into a 3-D array of overlapping windows.

    A window is a consecutive run of `window_size` bars, capturing one short
    episode of market activity.  The CNN treats each window as one sample.

    Stride-tricks approach
    ----------------------
    Instead of a slow Python loop, we use np.lib.stride_tricks.sliding_window_view.
    This creates a view (no data copy) that walks one step at a time through the
    data, producing all overlapping windows very efficiently.

    Parameters
    ----------
    df           : Scaled DataFrame.
    feature_cols : Columns to include in each window.
    window_size  : Number of bars per window (e.g. 64).

    Returns
    -------
    np.ndarray of shape (N, window_size, n_features), dtype float32.
    N = len(df) - window_size + 1  (number of windows).
    """
    # Extract just the feature columns as a plain 2-D float32 array.
    # Shape: (n_bars, n_features)
    data = df[feature_cols].to_numpy(dtype=np.float32)

    # sliding_window_view produces shape (n_bars - window_size + 1, n_features, window_size).
    # The transpose reorders the axes to (N, window_size, n_features), which is more
    # intuitive: each row is one window, each column is one time step.
    X_raw = np.lib.stride_tricks.sliding_window_view(
        data,
        window_shape=window_size,
        axis=0,
    ).transpose(0, 2, 1)  # → (N, window_size, n_features)

    print(f"make_windows: {X_raw.shape[0]:,} windows of shape "
          f"({window_size} bars × {X_raw.shape[2]} features)")
    return X_raw


# ── 7. Filter gap-spanning windows ───────────────────────────────────────────

def filter_gap_windows(
    X_raw: np.ndarray,
    df: pd.DataFrame,
    window_size: int,
    gap_seconds: float = 300.0,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Remove windows that straddle an overnight or weekend gap.

    Why this matters
    ----------------
    A 1-minute bar at 15:59 (market close) and the next bar at 9:30 the
    following morning are 17.5 hours apart.  A CNN fed this window would try
    to learn a "pattern" across that gap — but there is no meaningful pattern;
    the gap is just missing data.  Keeping such windows would add noise.

    How it works
    ------------
    1. Calculate the time difference between consecutive bars.
    2. Find positions where the gap exceeds `gap_seconds` (default 5 minutes).
    3. For each such position, mark all windows that include that position
       as invalid.
    4. Return only the valid windows, plus a boolean mask (so callers can
       align the windows back to timestamps if needed).

    Parameters
    ----------
    X_raw       : Raw window array from make_windows().
    df          : DataFrame with a 'timestamp' column.
    window_size : Number of bars per window (must match make_windows).
    gap_seconds : Gap threshold in seconds (default 300 = 5 minutes).

    Returns
    -------
    (X_clean, valid_mask)
      X_clean    : np.ndarray, only the valid windows.
      valid_mask : np.ndarray of bool, length = len(X_raw).
                   True at position i means window i is included in X_clean.
    """
    # Time difference between each bar and the previous one, in seconds.
    # .fillna(0) turns the very first NaN into zero so it doesn't flag as a gap.
    diffs_sec = df["timestamp"].diff().dt.total_seconds().fillna(0).to_numpy()

    # Positions in the DataFrame where a gap occurs.
    gap_positions = np.where(diffs_sec > gap_seconds)[0]

    # Start with all windows valid, then mark bad ones False.
    valid_mask = np.ones(len(X_raw), dtype=bool)

    for gp in gap_positions:
        # Any window that ends at or after the gap position (lo) and starts
        # before the gap position (hi) would include the gap.
        lo = max(0, gp - window_size + 1)
        hi = min(len(X_raw), gp + 1)
        valid_mask[lo:hi] = False

    X_clean = X_raw[valid_mask]

    print(f"filter_gap_windows: {len(gap_positions)} gaps found  |  "
          f"removed {(~valid_mask).sum():,} windows  |  "
          f"{X_clean.shape[0]:,} clean windows remain")
    return X_clean, valid_mask
