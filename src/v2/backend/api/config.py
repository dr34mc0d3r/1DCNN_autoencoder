"""api/config.py — GET /api/config and POST /api/config."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any

from services import config_manager, log_control

router = APIRouter(prefix="/api/config", tags=["config"])


class ConfigUpdate(BaseModel):
    model_config = {"extra": "allow"}


class LoggingToggle(BaseModel):
    enabled: bool


@router.get("")
def get_config() -> dict[str, Any]:
    """Return the full current configuration."""
    return config_manager.load()


@router.post("")
def set_config(body: ConfigUpdate) -> dict[str, Any]:
    """Merge the request body into config.json and return the updated config."""
    return config_manager.update(body.model_dump(exclude_unset=True))


@router.post("/logging")
def set_logging(body: LoggingToggle) -> dict[str, Any]:
    """Toggle file logging on/off at runtime and persist the setting."""
    config_manager.update({"logging_enabled": body.enabled})
    log_control.set_enabled(body.enabled)
    return {"logging_enabled": body.enabled}
