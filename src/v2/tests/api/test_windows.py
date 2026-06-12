"""tests/api/test_windows.py"""

import pytest


def test_windows_returns_200(client, sample_X):
    resp = client.get("/api/windows?n=10")
    assert resp.status_code == 200


def test_windows_response_shape(client, sample_X):
    resp = client.get("/api/windows?n=10")
    body = resp.json()
    assert body["n_windows"] <= 10
    assert body["window_size"] == 16
    assert body["n_features"] == 14
    assert len(body["windows"]) == body["n_windows"]


def test_windows_pixel_range(client, sample_X):
    resp = client.get("/api/windows?n=5")
    windows = resp.json()["windows"]
    for win in windows:
        for row in win:
            for val in row:
                assert 0 <= val <= 255
