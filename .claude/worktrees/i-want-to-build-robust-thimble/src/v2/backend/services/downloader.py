"""
services/downloader.py — Downloads bars from Alpaca and saves them to CSV.

BarDownloader wraps alpaca.fetch_bars() + storage.save_bars_to_csv() and
exposes a simple download() coroutine. Progress is reported via a callback
so the API layer can forward events to WebSocket clients.
"""

from __future__ import annotations

import logging

from services import alpaca, storage

logger = logging.getLogger(__name__)


class BarDownloader:
    """Download OHLCV bars from Alpaca and persist to CSV."""

    async def download(
        self,
        symbol: str,
        timeframe: str,
        start: str,
        end: str,
        progress_cb=None,
    ) -> str:
        """
        Fetch bars and write to downloads/{symbol}/{timeframe}.csv.

        Parameters
        ----------
        symbol / timeframe / start / end : Passed directly to Alpaca.
        progress_cb : Async callable(bars_fetched, symbol) for live progress.

        Returns
        -------
        Path to the written CSV file.
        """
        logger.info("Downloading %s %s  %s → %s", symbol, timeframe, start, end)

        all_bars = await alpaca.fetch_bars(
            symbols=[symbol],
            timeframe=timeframe,
            start=start,
            end=end,
            progress_cb=progress_cb,
        )

        bars = all_bars.get(symbol, [])
        if not bars:
            raise ValueError(f"No bars returned for {symbol} ({start} → {end})")

        path = storage.save_bars_to_csv(symbol, timeframe, bars)
        logger.info("Saved %d bars → %s", len(bars), path)
        return path
