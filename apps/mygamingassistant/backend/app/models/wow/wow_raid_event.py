"""WowRaidEvent — a scheduled Classic/Forever raid on a Discord guild.

guild_id FK → wow_raid_guild (ON DELETE CASCADE).
starts_at is stored as UTC timestamptz; the guild's timezone is used for
display only.  message_id is null until the bot posts the signup embed.

raid_key is a short slug identifying the instance (mc, onyxia, etc.).  title
overrides the default display name if set.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

RAID_KEYS = (
    # WoW Forever launch raids (Dec 9 patch)
    "barrow_deeps",
    "hyjal_summit",
    # Classic-era raids (added progressively)
    "mc",
    "onyxia",
    "bwl",
    "zg",
    "aq20",
    "aq40",
    "naxx",
)
RAID_STATUSES = ("scheduled", "cancelled", "completed")


class WowRaidEvent(Base):
    __tablename__ = "wow_raid_event"
    __table_args__ = (
        CheckConstraint(
            f"raid_key IN {RAID_KEYS!r}",
            name="ck_wowraidevent_raid_key",
        ),
        CheckConstraint(
            f"status IN {RAID_STATUSES!r}",
            name="ck_wowraidevent_status",
        ),
        CheckConstraint(
            "size_cap >= 1 AND size_cap <= 40",
            name="ck_wowraidevent_size_cap",
        ),
        # Efficiently list upcoming events per guild.
        Index("ix_wowraidevent_guild_starts_at", "guild_id", "starts_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    guild_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wow_raid_guild.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Short instance slug — validated by ck_wowraidevent_raid_key.
    raid_key: Mapped[str] = mapped_column(String(20), nullable=False)
    # Optional operator-supplied title.  Defaults to the instance's display name
    # when null.
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # UTC timestamp of raid start.
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # Maximum confirmed signups before the bench kicks in (1–40).
    size_cap: Mapped[int] = mapped_column(Integer, nullable=False, default=25)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="scheduled",
        server_default="scheduled",
    )
    # Channel where the signup embed was posted (may differ from guild's default).
    channel_id: Mapped[str] = mapped_column(String(32), nullable=False)
    # Discord message ID of the signup embed; null until the bot posts it.
    message_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # Discord user ID of whoever created the event.
    created_by_user_id: Mapped[str] = mapped_column(String(32), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
