"""tests/api/test_config.py"""

import pytest


def test_get_config_returns_200(client):
    resp = client.get("/api/config")
    assert resp.status_code == 200
    body = resp.json()
    assert "symbol" in body
    assert "window_size" in body


def test_get_config_symbol_is_test(client):
    resp = client.get("/api/config")
    assert resp.json()["symbol"] == "TEST"


def test_post_config_updates_symbol(client):
    resp = client.post("/api/config", json={"symbol": "GOOG"})
    assert resp.status_code == 200
    assert resp.json()["symbol"] == "GOOG"
    # Restore
    client.post("/api/config", json={"symbol": "TEST"})


def test_post_config_partial_update(client):
    original = client.get("/api/config").json()
    client.post("/api/config", json={"n_clusters": 5})
    updated = client.get("/api/config").json()
    assert updated["n_clusters"] == 5
    assert updated["window_size"] == original["window_size"]
    # Restore
    client.post("/api/config", json={"n_clusters": original["n_clusters"]})
