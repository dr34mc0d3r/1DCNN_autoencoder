"""tests/api/test_status.py"""

import pytest


def test_get_status_200(client):
    resp = client.get("/api/status")
    assert resp.status_code == 200


def test_get_status_has_expected_keys(client):
    body = resp = client.get("/api/status").json()
    for key in ("model_loaded", "scaler_loaded", "kmeans_loaded", "training", "downloading"):
        assert key in body, f"Missing key: {key}"


def test_status_booleans(client):
    body = client.get("/api/status").json()
    assert isinstance(body["model_loaded"], bool)
    assert isinstance(body["scaler_loaded"], bool)
