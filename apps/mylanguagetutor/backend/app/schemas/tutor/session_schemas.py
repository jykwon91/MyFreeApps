"""Pydantic schemas for tutor sessions and their turns."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from app.domain.levels import Level


class SessionCreateRequest(BaseModel):
    """Body for POST /sessions. Language + scenario are validated against the
    registries in the service (unknown values -> 422)."""

    model_config = ConfigDict(extra="forbid")

    language_code: str = Field(min_length=1, max_length=8)
    scenario_slug: str = Field(min_length=1, max_length=40)
    level: Level


class TurnResponse(BaseModel):
    id: uuid.UUID
    seq: int
    status: str
    learner_text: str
    reply_text: str | None = None
    corrections: JsonValue | None = None
    translation_text: str | None = None
    created_at: datetime


class SessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    language_code: str
    scenario_slug: str
    level: str
    status: str
    turn_count: int
    created_at: datetime
    updated_at: datetime
    ended_at: datetime | None = None


class SessionDetailResponse(SessionSummary):
    turns: list[TurnResponse]


class SessionListResponse(BaseModel):
    items: list[SessionSummary]
    total: int
    limit: int
    offset: int
