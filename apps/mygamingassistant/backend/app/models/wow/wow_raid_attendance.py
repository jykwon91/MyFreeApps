"""WowRaidAttendance — who came to a finished raid, migration 0039.

event_id FK → wow_raid_event (ON DELETE CASCADE): rows go with their raid
(Raid: Edit → Delete) or its guild, as sign-ups do.  UNIQUE(event_id,
discord_user_id) — one row per player per raid; its leading ``event_id``
also serves every per-raid and per-player read, so there is no other index.

Until a raid is recorded its sign-ups are its attendance.  At completion
(start + 6 h, or earlier with [Record now]) ``raid_attendance_service.record``
freezes them here, one row per sign-up with its outcome
(``raid_attendance.outcome_for``).  A leader then corrects the record: marks
an outcome (``marked_by_user_id`` / ``marked_at``) or adds a walk-in, whose
row has no ``signup_status``.  Every row comes from a sign-up or a leader.

There is no guild_id: every read starts from the guild's raids.  Spec and
role aren't kept: the sign-ups outlive completion, and the CSV joins them.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.wow.wow_raid_signup import CHARACTER_NAME_MAX, SIGNUP_STATUSES, WOW_CLASSES

# How a player's raid went.  ``tentative`` only ever comes from a sign-up;
# a leader marks the others (raid_attendance.SETTABLE_OUTCOMES).
ATTENDANCE_OUTCOMES = ("attended", "late", "standby", "tentative", "absent", "no_show")


class WowRaidAttendance(Base):
    __tablename__ = "wow_raid_attendance"
    __table_args__ = (
        UniqueConstraint(
            "event_id", "discord_user_id", name="uq_wowraidattendance_event_user"
        ),
        CheckConstraint(
            f"outcome IN {ATTENDANCE_OUTCOMES!r}",
            name="ck_wowraidattendance_outcome",
        ),
        CheckConstraint(
            f"signup_status IS NULL OR signup_status IN {SIGNUP_STATUSES!r}",
            name="ck_wowraidattendance_signup_status",
        ),
        CheckConstraint(
            f"wow_class IS NULL OR wow_class IN {WOW_CLASSES!r}",
            name="ck_wowraidattendance_wow_class",
        ),
        # A leader's change keeps who and when together.
        CheckConstraint(
            "(marked_by_user_id IS NULL) = (marked_at IS NULL)",
            name="ck_wowraidattendance_marked",
        ),
        # A row comes from a sign-up or from a leader.
        CheckConstraint(
            "signup_status IS NOT NULL OR marked_by_user_id IS NOT NULL",
            name="ck_wowraidattendance_source",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wow_raid_event.id", ondelete="CASCADE", name="fk_wowraidattendance_event"),
        nullable=False,
    )
    # Discord snowflake — stored as String(32).
    discord_user_id: Mapped[str] = mapped_column(String(32), nullable=False)
    # The name when the raid was recorded, or from the add's resolved member.
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    character_name: Mapped[Optional[str]] = mapped_column(
        String(CHARACTER_NAME_MAX), nullable=True
    )
    wow_class: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # The sign-up's status when recorded; null = a leader added them.
    signup_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)
    # The last leader change; both null until one.
    marked_by_user_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    marked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
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
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
