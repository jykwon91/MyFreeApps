"""Pydantic schemas for map-related operator endpoints (minimap upload).

The map read endpoints in api/games.py return a dict — kept that way to
preserve existing API shape. These schemas are only for the new auth-gated
write endpoints.
"""
from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel


class MinimapUploadUrlResponse(BaseModel):
    """Response from POST /api/maps/{map_id}/minimap-upload-url.

    The frontend PUTs the file to ``put_url`` (multipart not needed; raw body),
    then calls POST /api/maps/{map_id}/minimap with ``object_key`` to confirm.
    """

    put_url: str
    object_key: str


class MinimapConfirmBody(BaseModel):
    """Body for POST /api/maps/{map_id}/minimap — confirms the PUT completed
    and the backend should now persist the object key as the map's minimap_url.
    """

    object_key: str


class MapMinimapUpdated(BaseModel):
    """Response from POST /api/maps/{map_id}/minimap — the new effective URL
    the frontend should display (presigned GET URL).
    """

    map_id: uuid.UUID
    minimap_url: Optional[str] = None
