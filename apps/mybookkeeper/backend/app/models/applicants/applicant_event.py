"""SQLAlchemy ORM model for ``applicant_events`` — append-only.

Per RENTALS_PLAN.md §5.3: append-only stage / activity log for the applicant
pipeline. No ``updated_at`` column — events are immutable timeline records
that power funnel analytics (conversion rate, time-in-stage, etc.).

The first event for every Applicant is typically ``event_type = 'lead'``
with ``actor = 'system'`` (when promoted from an Inquiry by the PR 3.2
service) or ``actor = 'host'`` (manual create). Subsequent events represent
stage transitions and supplementary activity (notes, screening kicks,
reference contacts).
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
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.applicant_enums import (
    APPLICANT_EVENT_ACTORS_SQL,
    APPLICANT_EVENT_TYPES_SQL,
)
from app.db.base import Base


class ApplicantEvent(Base):
    __tablename__ = "applicant_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applicants.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    actor: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Structured metadata for stage_changed events: {from, to, note}.
    # NULL for non-stage events (note_added, screening_initiated, etc.).
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

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
            f"event_type IN {APPLICANT_EVENT_TYPES_SQL}",
            name="chk_applicant_event_type",
        ),
        CheckConstraint(
            f"actor IN {APPLICANT_EVENT_ACTORS_SQL}",
            name="chk_applicant_event_actor",
        ),
        # Per-applicant timeline (chronological). Migration creates this with
        # explicit ``occurred_at DESC`` via raw SQL — the ORM index here only
        # needs to declare the columns so SQLite test fixtures can mirror.
        Index(
            "ix_applicant_events_applicant_occurred",
            "applicant_id", "occurred_at",
        ),
        # Funnel aggregation by event type over time.
        Index(
            "ix_applicant_events_type_occurred",
            "event_type", "occurred_at",
        ),
    )
