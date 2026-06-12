"""api/models.py — GET /api/models, POST /api/models/{name}/activate, DELETE /api/models/{name}."""

from fastapi import APIRouter, HTTPException

from services import storage

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("")
def list_models() -> list[dict]:
    return storage.list_models()


@router.post("/{name}/activate")
def activate_model(name: str) -> dict:
    try:
        storage.activate_model(name)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"activated": name}


@router.delete("/{name}")
def delete_model(name: str) -> dict:
    if ".." in name or "/" in name or "\\" in name:
        raise HTTPException(400, "Invalid model name")
    storage.delete_named_model(name)
    return {"deleted": name}
