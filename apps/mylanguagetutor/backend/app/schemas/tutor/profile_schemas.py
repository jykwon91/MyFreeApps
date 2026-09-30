"""Pydantic schemas for the learner's tutor profile (onboarding choices)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.levels import Level


class ProfileUpdateRequest(BaseModel):
    """Body for PUT /profile. The language is validated against the registry
    in the service (unknown -> 422)."""

    model_config = ConfigDict(extra="forbid")

    language_code: str = Field(min_length=1, max_length=8)
    level: Level


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    language_code: str
    level: str
    updated_at: datetime
