"""CalendarEmailReviewQueue — holds reservation emails that couldn't be
auto-matched to an existing MBK listing.

When the Gmail booking parser encounters an email whose channel/listing pair
has no corresponding channel_listing row, it inserts a row here instead of
silently dropping it.  The user resolves each entry once:

  - ``pending`` (default): waiting for user action.
  - ``resolved``: user selected a listing → booking was created.
  - ``ignored``:  user chose "Ignore" → a blocklist entry was added.

``deleted_at`` supports soft-delete (user dismisses without acting).

Privacy: ``parsed_payload`` holds only Claude-extracted fields
(dates, price, guest name, listing ref) — never the raw email body.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CalendarEmailReviewQueue(Base):
    __tablename__ = "calendar_email_review_queue"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Gmail message ID — uniqueness enforced at (user_id, email_message_id)
    # by the migration index so re-scanning the same email is idempotent.
    email_message_id: Mapped[str] = mapped_column(String(255), nullable=False)

    # Channel slug: airbnb / furnished_finder / booking_com / vrbo.
    source_channel: Mapped[str] = mapped_column(String(40), nullable=False)

    # Extracted fields only — never the raw email body.
    parsed_payload: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}",
    )

    status: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="pending",
        server_default="pending",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'resolved', 'ignored')",
            name="chk_review_queue_status",
        ),
        # Dedup guard — identical Gmail message cannot produce two pending
        # entries for the same user.
        Index(
            "uq_review_queue_user_message_id",
            "user_id", "email_message_id",
            unique=True,
        ),
        # Listing page fetches by (org, status='pending').
        Index(
            "ix_review_queue_org_status",
            "organization_id", "status",
        ),
    )
