"""api/export.py — POST /api/export/artifact: save PNG/CSV/MD to the active bundle dir."""

import base64
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import storage

router = APIRouter(prefix="/api/export", tags=["export"])


class ArtifactRequest(BaseModel):
    filename: str
    data_url: Optional[str] = None  # data:image/png;base64,...
    text:     Optional[str] = None  # plain text (CSV, MD, JSON)


@router.post("/artifact")
def save_artifact(req: ArtifactRequest) -> dict:
    """Write a PNG (via base64 data URL) or text file to the active model bundle dir."""
    d = storage._active_bundle_dir()
    if d is None:
        raise HTTPException(424, "No active model bundle — activate or train a model first.")

    filename = os.path.basename(req.filename)
    if not filename or filename.startswith("."):
        raise HTTPException(400, "Invalid filename.")

    path = os.path.join(d, filename)

    if req.data_url:
        if "," not in req.data_url:
            raise HTTPException(400, "data_url must be a valid data URI (data:<mime>;base64,<data>).")
        _, b64 = req.data_url.split(",", 1)
        with open(path, "wb") as f:
            f.write(base64.b64decode(b64))
    elif req.text is not None:
        with open(path, "w", encoding="utf-8") as f:
            f.write(req.text)
    else:
        raise HTTPException(400, "Provide either data_url (PNG) or text (CSV/MD).")

    return {"saved": path}
