"""Pydantic schemas for map-related operator endpoints (minimap upload, zone polygons).

The map read endpoints in api/games.py return a dict — kept that way to
preserve existing API shape. These schemas are only for the new auth-gated
write endpoints.
"""
from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, Field


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


# ---------------------------------------------------------------------------
# Zone polygon bulk update (operator-only)
# ---------------------------------------------------------------------------

class PolygonPoint(BaseModel):
    """A single vertex of a zone polygon, in 0-1 normalized coords.

    The frontend stores points in this object shape so it can pass them
    directly into MapZoneOverlay's `pointsToSvg` helper. Pydantic enforces
    the [0, 1] range at the API boundary; the editor canvas already clamps
    locally but a malformed client should still 422.
    """

    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)


class ZonePolygonUpdate(BaseModel):
    """One zone's new polygon for a bulk update.

    ``polygon_points``: an empty list clears the polygon (zone becomes
    invisible/unclickable in plan mode); otherwise must contain >=3 points.
    The 3-point minimum is enforced server-side rather than via Pydantic
    so the failure surfaces in the per-zone ``failed`` list rather than
    422-ing the whole request — operators routinely leave a 1-2 point
    polygon mid-draw and we shouldn't fail the entire save.
    """

    slug: str = Field(min_length=1, max_length=100)
    polygon_points: list[PolygonPoint]


class BulkUpdateZonesBody(BaseModel):
    """Body for PATCH /api/maps/{map_id}/zones.

    Last-write-wins semantics — single-operator app, no optimistic
    concurrency check. Zones not included in this body are untouched.
    """

    zones: list[ZonePolygonUpdate] = Field(min_length=1)


class ZonePolygonFailure(BaseModel):
    """Per-zone failure detail returned alongside the ``updated`` list."""

    slug: str
    reason: str


class BulkUpdateZonesResult(BaseModel):
    """Response from PATCH /api/maps/{map_id}/zones.

    Partial successes are returned with status 200; the operator UI inspects
    ``failed`` to highlight broken zones in the editor without losing the
    saved ones. Whole-request errors (404 map, 401 auth) still use HTTP
    status codes.
    """

    updated: list[str]
    failed: list[ZonePolygonFailure]
