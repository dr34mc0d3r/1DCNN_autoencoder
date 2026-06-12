"""tests/api/test_train.py"""

import pytest


def test_train_status_idle_initially(client):
    resp = client.get("/api/train/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] in ("idle", "done", "error")


def test_train_stop_when_idle_is_graceful(client):
    resp = client.post("/api/train/stop")
    assert resp.status_code == 200


def test_train_start_returns_started(client, monkeypatch):
    import api.train as train_mod

    async def _fake_run():
        pass

    monkeypatch.setattr(train_mod, "_run_training", _fake_run)

    resp = client.post("/api/train")
    assert resp.status_code in (200, 202)
    body = resp.json()
    assert body.get("status") == "started"


# ── GET /api/train/data-preview ───────────────────────────────────────────────

def test_data_preview_200(client):
    resp = client.get("/api/train/data-preview")
    assert resp.status_code == 200


def test_data_preview_top_keys(client):
    body = client.get("/api/train/data-preview").json()
    assert set(body.keys()) >= {"stats", "columns", "train_rows", "test_rows"}


def test_data_preview_stats_keys(client):
    body = client.get("/api/train/data-preview").json()
    assert set(body["stats"].keys()) >= {
        "total_bars", "total_windows", "train_windows",
        "test_windows", "test_split_pct", "window_size",
    }


def test_data_preview_split_sums_to_total(client):
    stats = client.get("/api/train/data-preview").json()["stats"]
    assert stats["train_windows"] + stats["test_windows"] == stats["total_windows"]


def test_data_preview_train_rows_max_20(client):
    body = client.get("/api/train/data-preview").json()
    assert len(body["train_rows"]) <= 20


def test_data_preview_test_rows_max_20(client):
    body = client.get("/api/train/data-preview").json()
    assert len(body["test_rows"]) <= 20


def test_data_preview_columns_has_timestamp(client):
    body = client.get("/api/train/data-preview").json()
    assert "timestamp" in body["columns"]


def test_data_preview_row_keys_match_columns(client):
    body = client.get("/api/train/data-preview").json()
    if body["train_rows"]:
        assert set(body["train_rows"][0].keys()) == set(body["columns"])


def test_data_preview_test_split_pct_range(client):
    stats = client.get("/api/train/data-preview").json()["stats"]
    assert 0 < stats["test_split_pct"] < 100
