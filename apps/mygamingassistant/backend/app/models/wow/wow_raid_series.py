"""WowRaidSeries — a repeating raid (Raid: Edit → Repeat), migration 0037.

guild_id FK → wow_raid_guild (ON DELETE CASCADE).  The raid it was turned
on from and every raid it posted point back through
``wow_raid_event.series_id`` (ON DELETE SET NULL: stopping a repeat leaves
them as plain raids).

Every ``every_days`` days the notification worker posts a copy of the
latest raid in the repeat, ``post_ahead_hours`` before its start (null =
one interval, "when the one before starts"; never longer than the
interval, so at most one raid waits ahead).  ``next_starts_at`` is the next
raid not yet posted, at ``start_local`` in ``tz_name``: slots keep their
wall-clock time across DST.  Read through ``raid_repeat``.
"""
import uuid
from datetime import datetime, time, timezone
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Time, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WowRaidSeries(Base):
    __tablename__ = "wow_raid_series"
    __table_args__ = (
        CheckConstraint("every_days BETWEEN 1 AND 28", name="ck_wowraidseries_every_days"),
        # Up to 2 weeks ahead, and never more than one interval.
        CheckConstraint(
            "post_ahead_hours IS NULL OR (post_ahead_hours BETWEEN 1 AND 336 AND post_ahead_hours <= every_days * 24)",
            name="ck_wowraidseries_post_ahead",
        ),
        Index("ix_wowraidseries_guild_id", "guild_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    guild_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wow_raid_guild.id", ondelete="CASCADE", name="fk_wowraidseries_guild"),
        nullable=False,
    )
    # Days between raids (1–28).
    every_days: Mapped[int] = mapped_column(Integer, nullable=False)
    # How long before its start each raid posts; null = one interval.
    post_ahead_hours: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # The next raid not yet posted (UTC).
    next_starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # That raid's wall-clock time in tz_name — every slot's time of day.
    start_local: Mapped[time] = mapped_column(Time, nullable=False)
    # The server's timezone when the repeat was set (or its next date changed);
    # a later /raid-admin setup timezone change doesn't move it.
    tz_name: Mapped[str] = mapped_column(String(64), nullable=False)
    # Who turned it on: DMed if it stops because a post was refused.
    created_by_user_id: Mapped[str] = mapped_column(String(32), nullable=False)
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
