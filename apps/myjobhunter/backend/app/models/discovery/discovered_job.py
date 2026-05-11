"""ORM model for ``discovered_jobs`` — the inbox of proactively-found postings.

Per-user rows: each user gets their own row even for the same posting
seen by another user. At v1 scale (single-user / small tenant count)
this is simpler than a shared cache; refactor when MJH crosses ~10
active users and storage starts mattering.

Lifecycle:

1. Worker fetches from a source, normalizes a posting, upserts on
   ``(user_id, source, source_external_id)``.
2. ``score`` / ``scored_at`` populated by a separate scoring job
   triggered manually by the operator (cost gate).
3. Operator triages: ``dismissed_at`` (won't reappear) /
   ``saved_at`` (kept for later) / ``promoted_application_id``
   (promoted into the applications kanban).
4. ``expired_at`` set when the source removes the posting upstream.

State invariants:

- ``dismissed_at`` and ``saved_at`` are mutually exclusive
  (chk_discovered_state).
- ``promoted_application_id`` and ``promoted_at`` rise/fall together
  (chk_discovered_promoted).

Indexes:

- ``uq_discovered_user_source_extid``: primary dedup, drives the worker
  upsert. NOT partial — covers all rows including dismissed/expired so
  a refetched posting we already dismissed stays dismissed.
- ``uq_discovered_user_content_hash``: cross-source dedup on active
  rows. Same posting on Greenhouse + an aggregator → keep the first;
  the second silently drops at insert time.
- ``ix_discovered_inbox``: the triage view. Partial WHERE not-dismissed,
  not-saved, not-promoted keeps the index lean.
- ``ix_discovered_score_pending``: scoring worker scans for
  ``score IS NULL`` rows.

PII / untrusted-input note: ``description`` and ``title`` come from
external sources and may contain prompt-injection vectors. Every Claude
call that reads ``description`` MUST use a system prompt that explicitly
ignores embedded instructions (see job_analysis_service.score()).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Embedding dimensionality — matches the all-MiniLM-L6-v2 model wired in
# ``app.services.discovery.discovery_embedding_service``. Keep this in
# sync with the migration ``discemb260511_pgvector_embeddings``.
_EMBED_DIMS = 384


class DiscoveredJob(Base):
    __tablename__ = "discovered_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    source: Mapped[str] = mapped_column(String(30), nullable=False)
    source_external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    source_publisher: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
    )
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    company_name: Mapped[str] = mapped_column(String(300), nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="SET NULL"),
        nullable=True,
    )
    location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    remote_type: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="unknown",
    )

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_normalized: Mapped[str | None] = mapped_column(
        Text, nullable=True,
    )
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    posted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    discovered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    expired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    salary_min: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    salary_max: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    salary_currency: Mapped[str | None] = mapped_column(
        String(3), nullable=True, server_default="USD",
    )
    salary_period: Mapped[str | None] = mapped_column(String(10), nullable=True)

    score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    score_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    scored_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    scoring_extraction_log_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("extraction_logs.id", ondelete="SET NULL"),
        nullable=True,
    )

    dismissed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    dismissed_reason: Mapped[str | None] = mapped_column(
        String(30), nullable=True,
    )
    saved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    promoted_application_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applications.id", ondelete="SET NULL"),
        nullable=True,
    )
    promoted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    raw_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    fetch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("discovery_fetches.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Embedding columns (PR 4a). Written by
    # ``discovery_embedding_service.embed_pending_for_user`` after every
    # fetch. PR 4b will consume these via cosine-similarity ranking in
    # ``discovery_score_service`` to narrow the candidate set before
    # spending Anthropic tokens. Until PR 4b lands, these columns are
    # populated but unread.
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(_EMBED_DIMS), nullable=True,
    )
    embedding_model: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
    )
    embedded_at: Mapped[datetime | None] = mapped_column(
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
            "source IN ('greenhouse','lever','ashby','remoteok',"
            "'hn_who_is_hiring','workatastartup','jsearch','other')",
            name="chk_discovered_source",
        ),
        CheckConstraint(
            "remote_type IN ('remote','hybrid','onsite','unknown')",
            name="chk_discovered_remote_type",
        ),
        CheckConstraint(
            "score IS NULL OR (score >= 0 AND score <= 100)",
            name="chk_discovered_score",
        ),
        CheckConstraint(
            "salary_period IS NULL OR salary_period IN "
            "('annual','hourly','monthly')",
            name="chk_discovered_salary_period",
        ),
        CheckConstraint(
            "NOT (dismissed_at IS NOT NULL AND saved_at IS NOT NULL)",
            name="chk_discovered_state",
        ),
        CheckConstraint(
            "dismissed_reason IS NULL OR dismissed_reason IN ("
            "'wrong_stack','too_small_company','wrong_sector',"
            "'wrong_comp','not_remote','not_interested','other')",
            name="chk_discovered_dismissed_reason",
        ),
        CheckConstraint(
            "(promoted_application_id IS NULL) = (promoted_at IS NULL)",
            name="chk_discovered_promoted",
        ),
        Index("ix_discovered_user_id", "user_id"),
        Index(
            "uq_discovered_user_source_extid",
            "user_id",
            "source",
            "source_external_id",
            unique=True,
        ),
        Index(
            "uq_discovered_user_content_hash",
            "user_id",
            "content_hash",
            unique=True,
            postgresql_where=text(
                "content_hash IS NOT NULL AND dismissed_at IS NULL",
            ),
        ),
        Index(
            "ix_discovered_inbox",
            "user_id",
            text("score DESC NULLS LAST"),
            text("discovered_at DESC"),
            postgresql_where=text(
                "dismissed_at IS NULL "
                "AND saved_at IS NULL "
                "AND promoted_application_id IS NULL"
            ),
        ),
        Index(
            "ix_discovered_saved",
            "user_id",
            "saved_at",
            postgresql_where=text(
                "saved_at IS NOT NULL AND dismissed_at IS NULL",
            ),
        ),
        Index(
            "ix_discovered_promoted_app",
            "promoted_application_id",
            postgresql_where=text("promoted_application_id IS NOT NULL"),
        ),
        Index(
            "ix_discovered_score_pending",
            "user_id",
            "discovered_at",
            postgresql_where=text("score IS NULL"),
        ),
        Index(
            "ix_discovered_company",
            "user_id",
            "company_id",
            postgresql_where=text("company_id IS NOT NULL"),
        ),
    )
