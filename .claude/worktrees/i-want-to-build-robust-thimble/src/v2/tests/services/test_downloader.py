"""tests/services/test_downloader.py"""

import pytest

from services.downloader import BarDownloader


@pytest.mark.asyncio
async def test_downloader_calls_progress_cb(monkeypatch, tmp_backend, patch_config_manager):
    """BarDownloader.download must call progress_cb at least once and save a CSV."""
    events = []

    async def fake_fetch_bars(symbols, timeframe, start, end, progress_cb=None):
        if progress_cb:
            await progress_cb(10, symbols)
        # Return one synthetic bar per symbol
        return {s: [{"t": "2023-01-03T14:30:00Z", "o": 100, "h": 101,
                     "l": 99, "c": 100.5, "v": 5000, "vw": 100.2, "n": 50}]
                for s in symbols}

    import services.alpaca as alp_mod
    monkeypatch.setattr(alp_mod, "fetch_bars", fake_fetch_bars)

    async def cb(total, symbols):
        events.append((total, symbols))

    dl = BarDownloader()
    path = await dl.download("TEST2", "5Min", "2023-01-01", "2023-01-31", progress_cb=cb)
    assert len(events) >= 1
    assert path.endswith(".csv")
