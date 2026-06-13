"""
websocket/live.py — WebSocket connection manager and /ws endpoint.

A single WebSocket endpoint (/ws) handles all real-time updates. The
ConnectionManager broadcasts JSON messages to every connected client.

Message envelope: {"type": "<event_type>", "payload": {...}}

Event types
-----------
download_progress  : {"bars_fetched": int, "symbol": str}
training_epoch     : {"epoch": int, "train_loss": float, "val_loss": float, "guard_status": str}
training_complete  : {"stop_reason": str, "final_epoch": int}
infer_step         : {"timestamp": str, "mse": float, "cluster_label": int, "latent_vector": list}
cluster_complete   : {"n_clusters": int, "n_windows": int}
heartbeat          : {"ts": str}
error              : {"message": str}
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Tracks active WebSocket connections and broadcasts messages."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        logger.info("WebSocket connected  (total: %d)", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        self._connections = [c for c in self._connections if c is not ws]
        logger.info("WebSocket disconnected  (total: %d)", len(self._connections))

    async def broadcast(self, msg: dict[str, Any]) -> None:
        """Send msg as JSON to all connected clients, dropping dead connections."""
        text = json.dumps(msg)
        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send(self, event_type: str, data: dict[str, Any]) -> None:
        """Convenience wrapper: broadcast {type, data}."""
        await self.broadcast({"type": event_type, "data": data})


manager = ConnectionManager()


async def ws_endpoint(ws: WebSocket) -> None:
    """FastAPI WebSocket handler — mount this at /ws in app.py."""
    await manager.connect(ws)
    try:
        while True:
            # Keep connection alive; clients only receive, never send.
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)


async def heartbeat_loop() -> None:
    """Emit a heartbeat every 30 s so clients detect stale connections."""
    while True:
        await asyncio.sleep(30)
        ts = datetime.now(timezone.utc).isoformat()
        await manager.send("heartbeat", {"ts": ts})
