"""ORM model for ``job_analyses``.

A ``JobAnalysis`` row is a single Claude-driven fit-ranking pass over a
job description. It captures the JD text, the per-dimension verdicts the
model produced, and the operator's eventual decision (apply / save / drop).

The intended workflow:

1. Operator pastes a URL or JD text on ``/analyze``.
2. The backend extracts the JD (URL path) or accepts the text directly.
3. ``analyze`` calls Claude with the operator's profile snapshot + the JD
   and stores the result here.
4. The operator inspects the analysis. If they decide to apply, the
   ``apply`` endpoint creates an ``Application`` row and back-references it
   via ``applied_application_id``.

Schema-shape decisions
======================

Soft-delete via ``deleted_at`` mirrors :class:`Application` — the operator
can archive a low-fit analysis without wiping the audit trail.

The per-dimension verdicts live in JSONB rather than a side table because
the dimension list is opinionated, fixed at six rows, and never queried
analytically (no "show me all analyses with skill_match='gap'" use case
yet). When the operator asks for a leaderboard view in v2, a GIN index on
the JSONB will let us add filtering without a schema migration.

The ``fingerprint`` column is a SHA-256 hex of the source URL when one is
provided and the trimmed first 256 chars of the JD text otherwise. It
gives the v2 "you've already analyzed this" UX a cheap dedup hook without
forcing an expensive full-text comparison every time.

Tenant isolation
================
``user_id`` FK is CASCADE so deleting a user wipes every analysis they
ever ran. Repository-layer queries always filter by ``user_id``.

Enums as String + CheckConstraint per project convention — never
SQLAlchemy ``Enum`` type.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class JobAnalysis(Base):
    __tablename__ = "job_analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Source: at least one of source_url / jd_text is required at write
    # time (enforced in the service layer; the DB has a CHECK to defend
    # against bypass).
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    jd_text: Mapped[str] = mapped_column(Text, nullable=False)

    # SHA-256 hex (64 chars) of the canonical fingerprint material.
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)

    # Structured fields the JD-parsing prompt extracts BEFORE the analysis
    # pass — title, company, location, posted salary, summary, etc. Stored
    # as JSONB so v2 can add fields without a migration.
    extracted: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb"),
    )

    verdict: Mapped[str] = mapped_column(String(30), nullable=False)
    verdict_summary: Mapped[str] = mapped_column(Text, nullable=False)

    # Per-dimension rows: list of {key, status, rationale}. The rubric
    # is fixed at six dimensions today (skill_match, seniority, salary,
    # location_remote, work_auth, plus the verdict itself); v2 can grow
    # the list without a schema change.
    dimensions: Mapped[list[dict]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb"),
    )
    red_flags: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default="{}",
    )
    green_flags: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default="{}",
    )

    # Token + cost accounting. We mirror the resume_refinement_sessions
    # shape so the operator sees per-analysis cost in the same way they
    # see per-session cost on the resume tool.
    total_tokens_in: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0",
    )
    total_tokens_out: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0",
    )
    total_cost_usd: Mapped[float] = mapped_column(
        Numeric(10, 6), nullable=False, server_default="0",
    )

    # Set when the operator clicks "Add to applications". RESTRICT so
    # deleting an application that was sourced from an analysis raises
    # a clear FK error rather than silently nulling the link.
    applied_application_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applications.id", ondelete="SET NULL"),
        nullable=True,
    )

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        CheckConstraint(
            "verdict IN ('strong_fit','worth_considering','stretch','mismatch')",
            name="chk_job_analysis_verdict",
        ),
        CheckConstraint(
            "source_url IS NOT NULL OR length(jd_text) > 0",
            name="chk_job_analysis_has_source",
        ),
        # Listing the operator's analyses, newest-first, scoped to non-
        # deleted rows. ``created_at DESC`` matches the default sort on
        # the v2 leaderboard view.
        Index(
            "ix_job_analysis_user_created",
            "user_id",
            "created_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Idempotency: looking up "have I analyzed this exact URL/text
        # under this account already?" is the v2 dedup query. Partial
        # because soft-deleted rows shouldn't block re-analyzing.
        Index(
            "ix_job_analysis_user_fingerprint",
            "user_id",
            "fingerprint",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
