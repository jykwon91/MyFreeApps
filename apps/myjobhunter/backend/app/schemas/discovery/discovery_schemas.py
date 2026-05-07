"""Pydantic schemas for the /discover surface."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


_VALID_SOURCES = (
    "greenhouse",
    "lever",
    "ashby",
    "remoteok",
    "hn_who_is_hiring",
    "workatastartup",
    "jsearch",
    "other",
)


class DiscoverySourceCreate(BaseModel):
    """Body for ``POST /discover/sources``."""

    source: Literal[_VALID_SOURCES] = Field(  # type: ignore[valid-type]
        ..., description="Adapter to run.",
    )
    config: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Per-source config. JSearch needs ``query``; Greenhouse/"
            "Lever/Ashby need ``board`` (company slug); RemoteOK has no "
            "required keys."
        ),
    )
    fetch_interval_minutes: int = Field(
        default=1440, ge=15, le=10080,
        description="Minimum minutes between automatic fetches (cap = 7 days).",
    )


class DiscoverySourceResponse(BaseModel):
    """One DiscoverySource row."""

    id: uuid.UUID
    source: str
    config: dict[str, Any]
    is_active: bool
    fetch_interval_minutes: int
    last_fetched_at: datetime | None
    last_success_at: datetime | None
    last_error_at: datetime | None
    last_error_message: str | None
    consecutive_failures: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DiscoveryFetchResultResponse(BaseModel):
    """Returned by ``POST /discover/sources/{id}/refresh``."""

    fetch_id: uuid.UUID
    status: Literal["running", "success", "partial", "error"]
    fetched_count: int
    new_count: int
    updated_count: int
    duration_ms: int | None
    error_message: str | None


class DiscoveredJobResponse(BaseModel):
    """One DiscoveredJob row in the inbox view."""

    id: uuid.UUID
    source: str
    source_publisher: str | None
    source_url: str | None
    title: str
    company_name: str
    location: str | None
    remote_type: str
    description: str | None
    posted_at: datetime | None
    discovered_at: datetime
    salary_min: float | None
    salary_max: float | None
    salary_currency: str | None
    salary_period: str | None
    score: int | None
    score_reason: str | None
    scored_at: datetime | None
    dismissed_at: datetime | None
    saved_at: datetime | None
    promoted_application_id: uuid.UUID | None

    model_config = ConfigDict(from_attributes=True)


class DiscoveredJobListResponse(BaseModel):
    """Returned by ``GET /discover``."""

    items: list[DiscoveredJobResponse]
    total: int
    state: Literal["inbox", "saved", "all"]
