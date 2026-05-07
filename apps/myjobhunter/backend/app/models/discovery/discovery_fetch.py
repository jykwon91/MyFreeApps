"""ORM model for ``discovery_fetches`` — append-only audit of fetch cycles.

One row per (source × tick). Created with ``status='running'`` when the
worker claims it; updated to ``'success'`` / ``'partial'`` / ``'error'``
on completion. Stale ``running`` rows older than 30 minutes are reaped to
``error`` so a worker crash doesn't leave the audit trail in a confusing
state.

Reused for both per-source observability ("show me last 24h of
Greenhouse fetches for user X") and per-discovered_job traceability
("which fetch surfaced this posting?" via ``discovered_jobs.fetch_id``).
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
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DiscoveryFetch(Base):
    __tablename__ = "discovery_fetches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    discovery_source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("discovery_sources.id", ondelete="CASCADE"),
        nullable=False,
    )
    source: Mapped[str] = mapped_column(String(30), nullable=False)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="running",
    )
    http_status: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    fetched_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0",
    )
    new_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0",
    )
    updated_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0",
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('running','success','partial','error')",
            name="chk_discovery_fetch_status",
        ),
        Index("ix_discovery_fetch_user_started", "user_id", "started_at"),
        Index(
            "ix_discovery_fetch_source_started",
            "discovery_source_id",
            "started_at",
        ),
    )
