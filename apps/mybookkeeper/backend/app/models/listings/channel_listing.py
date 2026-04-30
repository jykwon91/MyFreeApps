"""ChannelListing — one row per (listing, channel) pair the host publishes on.

Per RENTALS_PLAN.md PR 1.4: this is the syncing surface. Each row carries
both directions of the iCal exchange:

- ``ical_export_token`` — random 32-char URL-safe token. The unauthenticated
  outbound iCal URL embeds this token as the sole secret (see
  ``app/api/calendar.py``). Generated server-side via ``secrets.token_urlsafe``;
  channels can poll without credentials but the URL is unguessable.
- ``ical_import_url`` — the channel's own iCal export URL the operator
  pastes in. Polled every 15 minutes by the scheduler worker. Plain-text
  storage — the URL contains the channel's public secret token, treated
  as a public-ish credential per CLAUDE.md.

The (listing_id, channel_id) UNIQUE constraint enforces one row per pair.
Cascade behaviour: ``listing_id`` ON DELETE CASCADE (deleting a listing
removes its channel links); ``channel_id`` ON DELETE RESTRICT (a channel
referenced by any channel_listing cannot be deleted — protects against
accidentally orphaning rows).
"""
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _generate_export_token() -> str:
    """Return a URL-safe random token for outbound iCal URLs.

    24 bytes -> 32 url-safe chars. Random source: ``secrets`` (CSPRNG),
    not ``random``, per CLAUDE.md "Token security".
    """
    return secrets.token_urlsafe(24)


class ChannelListing(Base):
    __tablename__ = "channel_listings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("listings.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    channel_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey("channels.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    external_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)

    ical_import_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    ical_import_secret_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_imported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    last_import_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    ical_export_token: Mapped[str] = mapped_column(
        String(64), nullable=False, default=_generate_export_token,
    )

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
        UniqueConstraint(
            "listing_id", "channel_id", name="uq_channel_listings_listing_channel",
        ),
        # Outbound iCal URL is keyed solely by token — must be globally unique
        # so a collision (extraordinarily unlikely with token_urlsafe(24)) can
        # never serve the wrong listing's calendar.
        UniqueConstraint(
            "ical_export_token", name="uq_channel_listings_export_token",
        ),
        Index(
            "ix_channel_listings_import_due",
            "ical_import_url",
            "last_imported_at",
            postgresql_where="ical_import_url IS NOT NULL",
        ),
    )
