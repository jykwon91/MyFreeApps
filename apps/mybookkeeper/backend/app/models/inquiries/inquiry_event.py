"""SQLAlchemy ORM model for ``inquiry_events``.

Per RENTALS_PLAN.md §5.2: append-only stage / activity log. No
``updated_at`` column — events are immutable timeline records that power
analytics (per §7.1: conversion funnel, days-to-first-response, etc.).

The first event for every Inquiry is ``event_type = 'received'`` with
``actor = 'host'`` (manual creates) or ``actor = 'system'`` (PR 2.2 email
parser). Subsequent events represent stage transitions and use the same
event_type values as ``Inquiry.stage``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.inquiry_enums import (
    INQUIRY_EVENT_ACTORS_SQL,
    INQUIRY_EVENT_TYPES_SQL,
)
from app.db.base import Base


class InquiryEvent(Base):
    __tablename__ = "inquiry_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    inquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiries.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    actor: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    occurred_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            f"event_type IN {INQUIRY_EVENT_TYPES_SQL}",
            name="chk_inquiry_event_type",
        ),
        CheckConstraint(
            f"actor IN {INQUIRY_EVENT_ACTORS_SQL}",
            name="chk_inquiry_event_actor",
        ),
        # Per-inquiry timeline (chronological).
        Index(
            "ix_inquiry_events_inquiry_occurred",
            "inquiry_id", "occurred_at",
        ),
    )
