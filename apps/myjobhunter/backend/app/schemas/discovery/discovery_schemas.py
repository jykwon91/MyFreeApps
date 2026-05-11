"""Pydantic schemas for the /discover surface."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.schemas.discovery.greenhouse_source_config import GreenhouseSourceConfig
from app.schemas.discovery.jsearch_source_config import JSearchSourceConfig
from app.schemas.discovery.lever_source_config import LeverSourceConfig


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
    """Body for ``POST /discover/sources``.

    Per-source config validation is dispatched on ``source``: jsearch
    sources are validated against ``JSearchSourceConfig`` (strict-typed,
    rejects unknown keys with a 422). Other source types still accept
    a loose dict for now — they have no adapter shipped yet, so there's
    no schema to enforce. When their adapters land, add a typed config
    class here and extend the dispatcher.

    ``name`` is an optional human-readable label. Two active sources for
    the same user + kind must have distinct names. Callers that don't
    supply a name get the empty-string default, which is fine as long as
    they only have one active source per kind. To register a second
    Greenhouse board (for example) the caller must give each source a
    unique name.
    """

    source: Literal[_VALID_SOURCES] = Field(  # type: ignore[valid-type]
        ..., description="Adapter to run.",
    )
    name: str = Field(
        default="",
        max_length=100,
        description=(
            "Optional human-readable label. Required only when the operator "
            "wants more than one active source of the same kind. Leading and "
            "trailing whitespace is stripped."
        ),
    )
    config: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Per-source config. ``jsearch`` is validated against "
            "``JSearchSourceConfig`` — typos in field names raise 422. "
            "Other source kinds currently accept any dict."
        ),
    )
    fetch_interval_minutes: int = Field(
        default=1440, ge=15, le=10080,
        description="Minimum minutes between automatic fetches (cap = 7 days).",
    )

    @model_validator(mode="after")
    def _normalise_and_validate(self) -> "DiscoverySourceCreate":
        # Strip whitespace from name. Pydantic v2 doesn't strip by default.
        self.name = self.name.strip()
        return self

    @model_validator(mode="after")
    def _validate_config_per_source(self) -> "DiscoverySourceCreate":
        """Reject typo'd or out-of-enum config values at request time.

        Each source with a shipped adapter gets strict config validation
        here — the operator gets a 422 with the field name instead of a
        silently-no-op saved search.  Sources that don't yet have an
        adapter (``ashby``, ``remoteok``, etc.) still accept a loose dict.
        """
        if self.source == "jsearch":
            # ``model_validate`` raises ValidationError; FastAPI converts
            # that to a 422 response automatically.
            JSearchSourceConfig.model_validate(self.config)
        elif self.source == "greenhouse":
            GreenhouseSourceConfig.model_validate(self.config)
        elif self.source == "lever":
            LeverSourceConfig.model_validate(self.config)
        return self


class DiscoverySourceResponse(BaseModel):
    """One DiscoverySource row."""

    id: uuid.UUID
    source: str
    name: str
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


_SCORE_TO_VERDICT: dict[int, str] = {
    90: "strong_fit",
    70: "worth_considering",
    40: "stretch",
    15: "mismatch",
}


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
    dismissed_reason: str | None = None
    saved_at: datetime | None
    promoted_application_id: uuid.UUID | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def verdict(self) -> str | None:
        """Human-readable verdict label derived from the numeric score.

        ``_verdict_to_score`` in job_analysis_service is the single
        source of truth; this is the inverse mapping so the frontend
        renders the label directly without duplicating the thresholds.
        Returns None for unscored rows.
        """
        return _SCORE_TO_VERDICT.get(self.score) if self.score is not None else None

    model_config = ConfigDict(from_attributes=True)


_DISMISS_REASONS = (
    "wrong_stack",
    "too_small_company",
    "wrong_sector",
    "wrong_comp",
    "not_remote",
    "not_interested",
    "other",
)


class DiscoveredJobDismissRequest(BaseModel):
    """Body for ``POST /discover/{id}/dismiss``. All fields optional."""

    reason: Literal[_DISMISS_REASONS] | None = Field(  # type: ignore[valid-type]
        default=None,
        description=(
            "Structured signal for why the operator dismissed this posting. "
            "Used as a teaching input for future scoring iterations."
        ),
    )


class DiscoveredJobListResponse(BaseModel):
    """Returned by ``GET /discover``."""

    items: list[DiscoveredJobResponse]
    total: int
    state: Literal["inbox", "saved", "all"]
