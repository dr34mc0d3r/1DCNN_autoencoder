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


# ── GET /api/download/list ────────────────────────────────────────────────────

def test_list_downloads_200(client):
    resp = client.get("/api/download/list")
    assert resp.status_code == 200


def test_list_downloads_returns_list(client):
    body = client.get("/api/download/list").json()
    assert isinstance(body, list)


def test_list_downloads_entry_keys(client):
    body = client.get("/api/download/list").json()
    if body:
        assert set(body[0].keys()) >= {"ticker", "timeframe", "start_date", "end_date", "rows", "path"}


def test_list_downloads_finds_test_csv(client):
    body = client.get("/api/download/list").json()
    tickers = [entry["ticker"] for entry in body]
    assert any(t == "TEST" for t in tickers)


def test_list_downloads_row_count_positive(client):
    body = client.get("/api/download/list").json()
    assert all(entry["rows"] > 0 for entry in body)


def test_list_downloads_dates_populated(client):
    body = client.get("/api/download/list").json()
    assert all(entry["start_date"] and entry["end_date"] for entry in body)


# ── DELETE /api/download/list/{ticker}/{timeframe} ────────────────────────────

def _write_minimal_csv(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("timestamp,open,high,low,close,volume\n2023-01-03 14:30:00,100,101,99,100,50000\n")


def test_delete_download_200(client, tmp_backend):
    csv_path = tmp_backend / "downloads" / "DELTEST" / "5Min.csv"
    _write_minimal_csv(csv_path)
    resp = client.delete("/api/download/list/DELTEST/5Min")
    assert resp.status_code == 200


def test_delete_download_file_removed(client, tmp_backend):
    csv_path = tmp_backend / "downloads" / "RMTEST" / "5Min.csv"
    _write_minimal_csv(csv_path)
    client.delete("/api/download/list/RMTEST/5Min")
    assert not csv_path.exists()


def test_delete_download_cleans_empty_dir(client, tmp_backend):
    ticker_dir = tmp_backend / "downloads" / "CLEANTEST"
    csv_path = ticker_dir / "5Min.csv"
    _write_minimal_csv(csv_path)
    client.delete("/api/download/list/CLEANTEST/5Min")
    assert not ticker_dir.exists()


def test_delete_download_404_on_missing(client):
    resp = client.delete("/api/download/list/NOEXIST/5Min")
    assert resp.status_code == 404


def test_delete_rejects_dotdot_in_ticker(client):
    resp = client.delete("/api/download/list/AB..CD/5Min")
    assert resp.status_code == 400
