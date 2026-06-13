"""api/status.py — GET /api/status — system health snapshot."""

from fastapi import APIRouter

from services import config_manager, storage

router = APIRouter(prefix="/api/status", tags=["status"])

# Mutable state shared with train.py and download.py via app state
_state: dict = {
    "training": "idle",   # idle | running | done | error
    "downloading": "idle",
}


def set_state(key: str, value: str) -> None:
    _state[key] = value


@router.get("")
def get_status() -> dict:
    cfg = config_manager.load()
    return {
        "model_loaded":    storage.model_exists(),
        "scaler_loaded":   storage.scaler_exists(),
        "kmeans_loaded":   storage.kmeans_exists(),
        "training":        _state["training"],
        "downloading":     _state["downloading"],
        "symbol":          cfg["symbol"],
        "timeframe":       cfg["timeframe"],
    }
