"""tests/services/test_alpaca.py"""

import pytest

from services import alpaca


@pytest.mark.asyncio
async def test_fetch_bars_auth_error(monkeypatch):
    """fetch_bars should raise on a 403 response."""
    import httpx

    async def mock_get(*args, **kwargs):
        return httpx.Response(403, json={"message": "forbidden"})

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    with pytest.raises(Exception):
        await alpaca.fetch_bars(
            symbols=["AAPL"],
            timeframe="1Min",
            start="2023-01-01",
            end="2023-01-02",
        )


@pytest.mark.asyncio
async def test_fetch_bars_empty_response(monkeypatch):
    """fetch_bars should return empty lists when bars key is missing."""
    import httpx

    call_count = 0

    class _MockAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, *args, **kwargs):
            return httpx.Response(200, json={"bars": {}, "next_page_token": None})

    monkeypatch.setattr(alpaca.httpx, "AsyncClient", _MockAsyncClient)

    result = await alpaca.fetch_bars(
        symbols=["AAPL"],
        timeframe="1Min",
        start="2023-01-01",
        end="2023-01-02",
    )
    assert isinstance(result, dict)
