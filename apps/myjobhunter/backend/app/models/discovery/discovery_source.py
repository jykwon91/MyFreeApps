"""ORM model for ``discovery_sources`` — per-user saved-search rows.

Each row is one source the operator has activated for proactive
discovery. The ``source`` enum names the adapter we run (greenhouse,
lever, ashby, remoteok, hn_who_is_hiring, workatastartup, jsearch).
``config`` carries adapter-specific settings (board slugs for ATS feeds,
Boolean keyword strings for aggregator queries).

The fetch worker polls ``WHERE is_active = true ORDER BY last_fetched_at
NULLS FIRST`` and runs adapters whose ``last_fetched_at`` is older than
``fetch_interval_minutes`` ago. A failure increments
``consecutive_failures``; a circuit breaker pauses the source once that
crosses 5.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DiscoverySource(Base):
    __tablename__ = "discovery_sources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    source: Mapped[str] = mapped_column(String(30), nullable=False)
    config: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"),
    )
    fetch_interval_minutes: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default="1440",
    )

    last_fetched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    last_success_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    last_error_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_seen_posted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    consecutive_failures: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default="0",
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
            name="chk_discovery_source",
        ),
        CheckConstraint(
            "fetch_interval_minutes >= 15",
            name="chk_discovery_fetch_interval_pos",
        ),
        CheckConstraint(
            "consecutive_failures >= 0",
            name="chk_discovery_consecutive_failures",
        ),
        Index("ix_discovery_source_user", "user_id"),
        Index(
            "uq_discovery_source_user_kind",
            "user_id",
            "source",
            unique=True,
            postgresql_where=text("is_active = true"),
        ),
        Index(
            "ix_discovery_source_due",
            "last_fetched_at",
            postgresql_where=text("is_active = true"),
        ),
    )
