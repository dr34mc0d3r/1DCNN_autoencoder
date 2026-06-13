"""tests/websocket/test_live.py"""

import asyncio

import pytest

from websocket.live import ConnectionManager


@pytest.mark.asyncio
async def test_manager_broadcast_to_connected(monkeypatch):
    """Messages should reach all active connections."""

    class _FakeWS:
        def __init__(self):
            self.sent = []
            self.accepted = False

        async def accept(self):
            self.accepted = True

        async def send_text(self, text):
            self.sent.append(text)

        async def receive_text(self):
            await asyncio.sleep(100)  # block forever

    manager = ConnectionManager()
    ws1, ws2 = _FakeWS(), _FakeWS()
    await manager.connect(ws1)
    await manager.connect(ws2)

    await manager.broadcast('{"type": "test", "data": {}}')

    assert len(ws1.sent) == 1
    assert len(ws2.sent) == 1


@pytest.mark.asyncio
async def test_manager_disconnect_removes_connection():
    manager = ConnectionManager()

    class _FakeWS:
        async def accept(self):
            pass

    ws = _FakeWS()
    await manager.connect(ws)
    assert ws in manager._connections
    manager.disconnect(ws)
    assert ws not in manager._connections


@pytest.mark.asyncio
async def test_manager_send_formats_json():
    """ConnectionManager.send should wrap data in {type, data} JSON."""
    import json

    received = []

    class _FakeWS:
        async def accept(self):
            pass

        async def send_text(self, text):
            received.append(text)

    manager = ConnectionManager()
    ws = _FakeWS()
    await manager.connect(ws)
    await manager.send("heartbeat", {"ts": 1})

    assert len(received) == 1
    msg = json.loads(received[0])
    assert msg["type"] == "heartbeat"
    assert msg["data"]["ts"] == 1  # live.py sends {"type": ..., "data": ...}
