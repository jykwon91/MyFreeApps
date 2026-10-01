"""WowRaidSignup — a single player's signup for a raid event.

event_id FK → wow_raid_event (ON DELETE CASCADE).
UNIQUE(event_id, discord_user_id) — one row per player per event; the
upsert_signup repo function updates in place.

wow_class, role and spec are nullable: a player can mark Absence before
choosing a class, and sign-ups saved before specs existed (revision 0028)
have no spec.  ``role`` is the seat role (tank / healer / dps) derived from
the spec.

Statuses (Raid-Helper semantics, revision 0029): ``confirmed`` and ``late``
hold a seat; ``queued`` is the bot's overflow line when the raid is full
(moved up automatically); ``bench`` is a backup the member chose (never
moved up automatically); ``tentative`` and ``absence`` hold no seat.
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

WOW_CLASSES = (
    "warrior",
    "paladin",
    "hunter",
    "rogue",
    "priest",
    "shaman",
    "mage",
    "warlock",
    "druid",
)
RAID_ROLES = ("tank", "healer", "dps")
# Every spec id across all classes ("holy" is both a paladin and a priest
# spec).  The class/spec pairing is checked in code against
# app.services.wow.raid_catalog.SPECS, which a unit test pins to this tuple.
WOW_SPECS = (
    "affliction",
    "arcane",
    "arms",
    "assassination",
    "balance",
    "beast-mastery",
    "combat",
    "demonology",
    "destruction",
    "discipline",
    "elemental",
    "enhancement",
    "feral-damage",
    "feral-tank",
    "fire",
    "frost",
    "fury",
    "holy",
    "marksmanship",
    "protection",
    "restoration",
    "retribution",
    "shadow",
    "subtlety",
    "survival",
)
SIGNUP_STATUSES = ("confirmed", "late", "tentative", "bench", "queued", "absence")


class WowRaidSignup(Base):
    __tablename__ = "wow_raid_signup"
    __table_args__ = (
        UniqueConstraint(
            "event_id", "discord_user_id", name="uq_wowraidsignup_event_user"
        ),
        CheckConstraint(
            f"wow_class IS NULL OR wow_class IN {WOW_CLASSES!r}",
            name="ck_wowraidsignup_wow_class",
        ),
        CheckConstraint(
            f"role IS NULL OR role IN {RAID_ROLES!r}",
            name="ck_wowraidsignup_role",
        ),
        CheckConstraint(
            f"status IN {SIGNUP_STATUSES!r}",
            name="ck_wowraidsignup_status",
        ),
        CheckConstraint(
            f"spec IS NULL OR spec IN {WOW_SPECS!r}",
            name="ck_wowraidsignup_spec",
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
        ForeignKey("wow_raid_event.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Discord snowflake — stored as String(32).
    discord_user_id: Mapped[str] = mapped_column(String(32), nullable=False)
    # Display name at signup time (may differ from current Discord display name).
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Nullable until the player selects their class via the bot button menu.
    wow_class: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Nullable for the same reason as wow_class.
    role: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # Null for sign-ups saved before specs existed, and for absences without a class.
    spec: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="confirmed",
        server_default="confirmed",
    )
    signed_up_at: Mapped[datetime] = mapped_column(
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
