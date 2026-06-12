"""tests/api/test_infer.py"""

import pytest


def test_infer_results_idle_initially(client):
    resp = client.get("/api/infer/results")
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] in ("idle", "done", "error")
    assert "results" in body


def test_infer_stop_when_idle(client):
    resp = client.post("/api/infer/stop")
    assert resp.status_code == 200


def test_infer_start_enqueues(client, monkeypatch):
    import api.infer as infer_mod

    async def _fake_run(req):
        pass

    monkeypatch.setattr(infer_mod, "_run_inference", _fake_run)

    resp = client.post("/api/infer", json={
        "infer_start": "2023-01-01", "infer_end": "2023-01-31",
    })
    assert resp.status_code in (200, 202)
