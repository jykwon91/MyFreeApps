"""Pydantic schemas for cook logs (a record of cooking a version)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CookLogCreateRequest(BaseModel):
    """Body for POST /recipes/{id}/versions/{vid}/cooks."""

    model_config = ConfigDict(extra="forbid")

    cooked_at: datetime | None = Field(
        default=None,
        description="When it was cooked. Defaults to now if omitted.",
    )
    rating: int | None = Field(default=None, ge=1, le=5)
    outcome_notes: str | None = Field(default=None, max_length=2000)


class CookLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_id: uuid.UUID
    cooked_at: datetime
    rating: int | None = None
    outcome_notes: str | None = None
    created_at: datetime
