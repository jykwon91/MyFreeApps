"""CalendarListingBlocklist — per-user, per-listing opt-out from email parsing.

When the user selects "Ignore forever" on a review-queue entry, the channel
slug and external listing identifier are stored here. Future inbound emails
whose (user_id, source_channel, source_listing_id) tuple matches a blocklist
row are silently discarded by the booking parser.

The UNIQUE constraint on (user_id, source_channel, source_listing_id) makes
inserting the same ignore twice an idempotent no-op — use INSERT … ON CONFLICT
DO NOTHING in the repository.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CalendarListingBlocklist(Base):
    __tablename__ = "calendar_listing_blocklist"

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
    )
    # Channel slug that issued the external listing identifier.
    source_channel: Mapped[str] = mapped_column(String(40), nullable=False)
    # Opaque identifier the channel uses for this listing in emails.
    source_listing_id: Mapped[str] = mapped_column(String(255), nullable=False)
    # Optional reason the user gave (e.g. "friend's listing I help manage").
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "source_channel", "source_listing_id",
            name="uq_blocklist_user_channel_listing",
        ),
        Index(
            "ix_blocklist_user_channel",
            "user_id", "source_channel",
        ),
    )
