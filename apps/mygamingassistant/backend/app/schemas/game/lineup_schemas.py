"""Pydantic schemas for lineup-related API requests and responses."""
from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Nested read models
# ---------------------------------------------------------------------------

class ZoneRead(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    polygon_points: list[dict]

    model_config = {"from_attributes": True}


class UtilityTypeRead(BaseModel):
    id: uuid.UUID
    slug: str
    name: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Lineup read
# ---------------------------------------------------------------------------

class LineupRead(BaseModel):
    id: uuid.UUID
    game_id: uuid.UUID
    map_id: uuid.UUID
    target_zone_id: uuid.UUID
    stand_zone_id: uuid.UUID
    side: str
    utility_type_id: uuid.UUID
    title: str
    notes: Optional[str] = None
    stand_screenshot_url: Optional[str] = None
    aim_screenshot_url: Optional[str] = None
    aim_anchor_x: Optional[float] = None
    aim_anchor_y: Optional[float] = None
    setup_seconds: Optional[int] = None
    attribution_url: Optional[str] = None
    attribution_author: Optional[str] = None
    status: str

    # Expanded relations (populated when available)
    target_zone: Optional[ZoneRead] = None
    stand_zone: Optional[ZoneRead] = None
    utility_type: Optional[UtilityTypeRead] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Lineup create
# ---------------------------------------------------------------------------

class LineupCreate(BaseModel):
    game_id: uuid.UUID
    map_id: uuid.UUID
    target_zone_id: uuid.UUID
    stand_zone_id: uuid.UUID
    side: str
    utility_type_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=255)
    notes: Optional[str] = None
    # Object keys in MinIO (not full URLs — service generates presigned read URLs)
    stand_screenshot_key: Optional[str] = None
    aim_screenshot_key: Optional[str] = None
    aim_anchor_x: Optional[float] = Field(None, ge=0.0, le=1.0)
    aim_anchor_y: Optional[float] = Field(None, ge=0.0, le=1.0)
    setup_seconds: Optional[int] = Field(None, ge=0)
    attribution_url: Optional[str] = None
    attribution_author: Optional[str] = None

    @field_validator("side")
    @classmethod
    def validate_side(cls, v: str) -> str:
        if v not in ("side_a", "side_b", "any"):
            raise ValueError("side must be side_a, side_b, or any")
        return v


# ---------------------------------------------------------------------------
# Lineup patch
# ---------------------------------------------------------------------------

class LineupPatch(BaseModel):
    target_zone_id: Optional[uuid.UUID] = None
    stand_zone_id: Optional[uuid.UUID] = None
    side: Optional[str] = None
    utility_type_id: Optional[uuid.UUID] = None
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    notes: Optional[str] = None
    aim_anchor_x: Optional[float] = Field(None, ge=0.0, le=1.0)
    aim_anchor_y: Optional[float] = Field(None, ge=0.0, le=1.0)
    setup_seconds: Optional[int] = Field(None, ge=0)
    attribution_url: Optional[str] = None
    attribution_author: Optional[str] = None

    @field_validator("side")
    @classmethod
    def validate_side(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("side_a", "side_b", "any"):
            raise ValueError("side must be side_a, side_b, or any")
        return v


# ---------------------------------------------------------------------------
# Upload URL response
# ---------------------------------------------------------------------------

class UploadUrlResponse(BaseModel):
    lineup_id: uuid.UUID
    stand_upload_url: str
    aim_upload_url: str
    stand_object_key: str
    aim_object_key: str
