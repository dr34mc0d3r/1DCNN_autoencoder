"""tests/api/test_download.py"""

import pytest


def test_download_status_200(client):
    resp = client.get("/api/download/status")
    assert resp.status_code == 200


def test_download_status_has_state(client):
    body = client.get("/api/download/status").json()
    assert "state" in body


def test_download_start_returns_started(client, monkeypatch):
    """POST /api/download starts a download task (we don't wait for it)."""
    # Patch the downloader to be a no-op so we don't hit Alpaca
    import api.download as dl_mod

    async def _fake_run(symbol, timeframe, start, end):
        pass

    monkeypatch.setattr(dl_mod, "_run_download", _fake_run)

    resp = client.post("/api/download", json={
        "symbol": "TEST", "timeframe": "5Min",
        "start": "2023-01-01", "end": "2023-01-31",
    })
    assert resp.status_code in (200, 202)
