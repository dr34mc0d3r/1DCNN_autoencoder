"""api/config.py — GET /api/config and POST /api/config."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any

from services import config_manager

router = APIRouter(prefix="/api/config", tags=["config"])


class ConfigUpdate(BaseModel):
    model_config = {"extra": "allow"}


@router.get("")
def get_config() -> dict[str, Any]:
    """Return the full current configuration."""
    return config_manager.load()


@router.post("")
def set_config(body: ConfigUpdate) -> dict[str, Any]:
    """Merge the request body into config.json and return the updated config."""
    return config_manager.update(body.model_dump(exclude_unset=True))
