/**
 * ws.js — Singleton WebSocket that reconnects on close.
 * Consumers register typed handlers via ws.on(type, callback).
 */

const WS_URL = `ws://${location.host}/ws`;

let _socket = null;
const _handlers = new Map(); // type → Set<callback>

function _connect() {
  _socket = new WebSocket(WS_URL);

  _socket.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data);
      const type = msg.type ?? "unknown";
      const handlers = _handlers.get(type) ?? new Set();
      const wildcards = _handlers.get("*") ?? new Set();
      for (const cb of [...handlers, ...wildcards]) cb(msg.data, type);
    } catch {
      // ignore malformed frames
    }
  });

  _socket.addEventListener("close", () => {
    // Reconnect after 3 s
    setTimeout(_connect, 3000);
  });
}

_connect();

export const ws = {
  on(type, callback) {
    if (!_handlers.has(type)) _handlers.set(type, new Set());
    _handlers.get(type).add(callback);
    return () => _handlers.get(type).delete(callback);
  },

  off(type, callback) {
    _handlers.get(type)?.delete(callback);
  },
};
