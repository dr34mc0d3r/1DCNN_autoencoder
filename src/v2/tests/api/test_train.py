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
