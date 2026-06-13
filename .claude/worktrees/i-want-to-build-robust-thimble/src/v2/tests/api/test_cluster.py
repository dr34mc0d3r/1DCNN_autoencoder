"""tests/api/test_cluster.py"""

import pytest


def test_cluster_get_returns_state(client):
    resp = client.get("/api/cluster")
    assert resp.status_code == 200
    body = resp.json()
    assert "state" in body


def test_cluster_start_enqueues(client, monkeypatch):
    import api.cluster as cluster_mod

    async def _fake_run():
        pass

    monkeypatch.setattr(cluster_mod, "_run_cluster", _fake_run)

    resp = client.post("/api/cluster")
    assert resp.status_code in (200, 202)
    assert resp.json().get("status") == "started"
