"""ListingBlackout — date ranges when a listing is unavailable.

Per RENTALS_PLAN.md PR 1.4 (channels): a listing's calendar consists of
date-range blackouts. Each row's ``source`` records where the blackout
came from — ``manual`` (operator typed it), or a channel slug
(``airbnb`` / ``vrbo`` / ``furnished_finder`` / ``rotating_room``)
when imported via iCal poll.

iCal events have a UID; we persist that UID in ``source_event_id``. Re-poll
of the same feed UPSERTs against (listing_id, source, source_event_id) so
the operation is idempotent — the same UID reappearing only updates dates.
A UID that disappears from the feed is taken as a cancellation and the row
is deleted by the polling job.

Date semantics: ``starts_on`` inclusive, ``ends_on`` exclusive — the iCal
RFC 5545 convention for all-day VEVENTs (DTEND is the day AFTER the last
blocked day). We preserve the convention through the API and DB so we
never drift between import + export.
"""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ListingBlackout(Base):
    __tablename__ = "listing_blackouts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("listings.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)

    # ``manual`` for operator-entered, otherwise a channel slug.
    source: Mapped[str] = mapped_column(
        String(40), nullable=False, default="manual", server_default="manual",
    )
    # iCal VEVENT UID for dedup on re-poll. NULL for ``manual`` rows.
    source_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Host-written annotation. Never touched by the iCal poller UPSERT — only
    # the PATCH /listings/blackouts/{id} endpoint may write here.
    host_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        # ends_on must be strictly after starts_on (iCal exclusive convention
        # — a single blocked day has DTEND = DTSTART + 1).
        CheckConstraint("ends_on > starts_on", name="chk_listing_blackouts_date_range"),
        # Idempotent upsert key for the iCal poll. Partial — only enforced
        # where source_event_id is set (manual rows have no UID).
        Index(
            "uq_listing_blackouts_source_uid",
            "listing_id", "source", "source_event_id",
            unique=True,
            postgresql_where=text("source_event_id IS NOT NULL"),
        ),
        Index(
            "ix_listing_blackouts_listing_dates",
            "listing_id", "starts_on", "ends_on",
        ),
    )
