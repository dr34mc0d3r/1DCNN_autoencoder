"""
services/alpaca.py — Async httpx client for the Alpaca Markets data API.

Uses httpx.AsyncClient and paginates through all pages of bar data.
Credentials are read from config_manager — never hard-coded here.
"""

from __future__ import annotations

import httpx

from services import config_manager


def _headers() -> dict[str, str]:
    cfg = config_manager.load()
    return {
        "APCA-API-KEY-ID": cfg["alpaca_key"],
        "APCA-API-SECRET-KEY": cfg["alpaca_secret"],
    }


def _base_url() -> str:
    return config_manager.get("alpaca_base_url", "https://data.alpaca.markets")


async def fetch_bars(
    symbols: list[str],
    timeframe: str,
    start: str,
    end: str,
    progress_cb=None,
) -> dict[str, list[dict]]:
    """
    Fetch OHLCV bars for one or more symbols, paginating until exhausted.

    Parameters
    ----------
    symbols     : List of ticker symbols, e.g. ["TSLA"].
    timeframe   : Alpaca timeframe string, e.g. "1Min", "1Day".
    start / end : ISO 8601 date strings.
    progress_cb : Optional async callable(bars_fetched, symbol) for progress updates.

    Returns
    -------
    Dict mapping symbol → list of raw bar dicts from the Alpaca API.
    """
    all_bars: dict[str, list] = {s: [] for s in symbols}
    params: dict = {
        "symbols": ",".join(symbols),
        "timeframe": timeframe,
        "start": start,
        "end": end,
        "adjustment": "split",
        "feed": "iex",
        "limit": 10000,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            r = await client.get(
                f"{_base_url()}/v2/stocks/bars",
                headers=_headers(),
                params=params,
            )
            r.raise_for_status()
            body = r.json()

            for symbol, bars in body.get("bars", {}).items():
                all_bars.setdefault(symbol, []).extend(bars)

            if progress_cb:
                total = sum(len(v) for v in all_bars.values())
                await progress_cb(total, ",".join(symbols))

            next_token = body.get("next_page_token")
            if not next_token:
                break
            params["page_token"] = next_token

    return all_bars


async def fetch_latest_bars(symbol: str, timeframe: str, n_bars: int = 300) -> list[dict]:
    """Return the most recent n_bars completed bars for a single symbol."""
    from datetime import datetime, timedelta
    end   = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    start = (datetime.utcnow() - timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ")
    result = await fetch_bars([symbol], timeframe, start, end)
    return result.get(symbol, [])[-n_bars:]
