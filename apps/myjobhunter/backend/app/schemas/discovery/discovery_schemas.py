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


class DiscoverySourcePatch(BaseModel):
    """Body for ``PATCH /discover/sources/{id}``.

    All fields are optional — only the fields provided are updated.
    At least one field must be present (validated at the service layer).

    ``fetch_interval_minutes``: must be in the same range as creation
    (15–10080 minutes) when provided.
    ``name``: trimmed; pass ``""`` to clear the label.
    ``is_active``: allows re-activation (``true``) as well as
    deactivation (``false``). For standard deactivation, prefer the
    ``DELETE /discover/sources/{id}`` endpoint — this field is for
    programmatic toggle scenarios.
    ``config``: when provided, **replaces** the entire config JSONB blob
    for the source.  The caller must supply a complete, valid config for
    the source's kind — the same per-source validation rules as creation
    are applied.  Partial config merge is intentionally NOT supported:
    the frontend dialog pre-fills all fields from the existing row and
    sends a full replacement, so the server always receives a well-formed
    shape. The source kind itself cannot be changed via PATCH — callers
    should delete and recreate for a kind change.

    ``source_kind``: the source kind of the row being patched, required
    when ``config`` is provided so the server can dispatch config
    validation without a separate round-trip to read the row.
    """

    fetch_interval_minutes: int | None = Field(
        default=None, ge=15, le=10080,
        description="Minimum minutes between automatic fetches (cap = 7 days).",
    )
    name: str | None = Field(
        default=None,
        max_length=100,
        description="Optional human-readable label. Pass empty string to clear.",
    )
    is_active: bool | None = Field(
        default=None,
        description="Activate (true) or deactivate (false) this source.",
    )
    config: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Full replacement config for the source. When provided, "
            "``source_kind`` must also be supplied for per-source validation."
        ),
    )
    source_kind: str | None = Field(
        default=None,
        description=(
            "Source kind of the row being patched (e.g. 'jsearch', 'greenhouse', "
            "'lever'). Required when ``config`` is provided so the server can "
            "dispatch per-source config validation."
        ),
    )

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "DiscoverySourcePatch":
        if (
            self.fetch_interval_minutes is None
            and self.name is None
            and self.is_active is None
            and self.config is None
        ):
            raise ValueError(
                "At least one field (fetch_interval_minutes, name, is_active, config) must be provided."
            )
        if self.name is not None:
            self.name = self.name.strip()
        if self.config is not None and self.source_kind is None:
            raise ValueError(
                "source_kind is required when config is provided."
            )
        return self

    @model_validator(mode="after")
    def _validate_config_per_source(self) -> "DiscoverySourcePatch":
        """Apply per-source config validation when config is being updated.

        Mirrors the same dispatch logic in ``DiscoverySourceCreate`` so
        config edits are held to the same validation standard as creation.
        """
        if self.config is None:
            return self
        if self.source_kind == "jsearch":
            JSearchSourceConfig.model_validate(self.config)
        elif self.source_kind == "greenhouse":
            GreenhouseSourceConfig.model_validate(self.config)
        elif self.source_kind == "lever":
            LeverSourceConfig.model_validate(self.config)
        return self


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
    # Derived from the fetch FK: which saved search produced this posting.
    # Null for legacy rows fetched before the fetch_id column was added, or
    # for rows whose fetch row has been reaped.
    discovery_source_id: uuid.UUID | None = None

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
    # Inbox scoring coverage, spanning the WHOLE active inbox (not just the
    # returned page). ``scored_count`` of ``total_count`` rows carry an AI
    # score; the rest are awaiting scoring or fell outside the day's scoring
    # budget. The frontend renders this as "Scored N of M" so a large
    # unscored tail reads as "daily limit reached", not "broken". Both are
    # None for the ``saved`` / ``all`` views, where the coverage framing
    # doesn't apply.
    scored_count: int | None = None
    total_count: int | None = None
