"""Pydantic schemas for LineupPackage CRUD.

Endpoints:
  GET  /api/lineup-packages             — list
  POST /api/lineup-packages             — create
  GET  /api/lineup-packages/{id}        — detail
  PATCH /api/lineup-packages/{id}       — rename / add/remove/reorder lineups
  DELETE /api/lineup-packages/{id}      — hard delete
  POST /api/lineup-packages/{id}/pin    — return lineup_ids for client-side pin-all
"""
from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, Field, field_validator


VALID_SIDES = frozenset({"side_a", "side_b", "any"})


class LineupPackageLineupRead(BaseModel):
    lineup_id: uuid.UUID
    sort_order: int

    model_config = {"from_attributes": True}


class LineupPackageRead(BaseModel):
    id: uuid.UUID
    name: str
    game_id: uuid.UUID
    map_id: uuid.UUID
    side: str
    created_at: str
    lineup_ids: list[uuid.UUID]  # ordered by sort_order

    model_config = {"from_attributes": True}


class LineupPackageCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    game_id: uuid.UUID
    map_id: uuid.UUID
    side: str
    lineup_ids: list[uuid.UUID] = Field(default_factory=list)

    @field_validator("side")
    @classmethod
    def validate_side(cls, v: str) -> str:
        if v not in VALID_SIDES:
            raise ValueError(f"side must be one of {sorted(VALID_SIDES)}")
        return v


class LineupPackagePatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    side: Optional[str] = None
    # When provided, replaces the entire lineup list (ordered).
    # Omit (leave as None) to keep existing lineups unchanged.
    lineup_ids: Optional[list[uuid.UUID]] = None

    @field_validator("side")
    @classmethod
    def validate_side(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_SIDES:
            raise ValueError(f"side must be one of {sorted(VALID_SIDES)}")
        return v


class PinAllResponse(BaseModel):
    """Response from POST /api/lineup-packages/{id}/pin.

    Pins live in the frontend localStorage (usePins hook). This endpoint
    returns the ordered lineup_ids so the frontend can iterate and pin each
    via usePins. No server state is modified.
    """
    package_id: uuid.UUID
    lineup_ids: list[uuid.UUID]
    message: str = "Pin these lineup IDs using the client-side pin store."
