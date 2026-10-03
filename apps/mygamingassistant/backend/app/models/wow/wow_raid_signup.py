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

``character_name`` (revision 0034) is the in-game name this sign-up shows
instead of ``display_name``; copied from the member's saved names when they
sign up or switch class.

Groups (revision 0044): ``raid_group`` / ``group_slot`` are the player's
place in the leader's planned groups (Raid: Edit → [Groups]), both null
outside one.  Read them through ``raid_groups``, which ignores a place whose
player has no seat; only a planner save writes them.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
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
# Character names are 2-12 letters (app.services.wow.raid_character.clean_name).
CHARACTER_NAME_MIN = 2
CHARACTER_NAME_MAX = 12
# A note for the raid leader is 1-100 characters (app.services.wow.raid_note.clean_note).
NOTE_MAX = 100
# The planned groups are groups of five, at most eight (a 40-man raid): app.services.wow.raid_groups.
GROUP_SIZE = 5
MAX_GROUPS = 8


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
        CheckConstraint(
            "character_name IS NULL OR char_length(character_name) "
            f"BETWEEN {CHARACTER_NAME_MIN} AND {CHARACTER_NAME_MAX}",
            name="ck_wowraidsignup_character_name_len",
        ),
        CheckConstraint(
            f"note IS NULL OR char_length(note) BETWEEN 1 AND {NOTE_MAX}",
            name="ck_wowraidsignup_note_len",
        ),
        # A place in the planned groups: both or neither.
        CheckConstraint(
            "(raid_group IS NULL) = (group_slot IS NULL)",
            name="ck_wowraidsignup_group_pair",
        ),
        CheckConstraint(
            f"raid_group IS NULL OR raid_group BETWEEN 1 AND {MAX_GROUPS}",
            name="ck_wowraidsignup_raid_group",
        ),
        CheckConstraint(
            f"group_slot IS NULL OR group_slot BETWEEN 1 AND {GROUP_SIZE}",
            name="ck_wowraidsignup_group_slot",
        ),
        # One player per slot.
        Index(
            "uq_wowraidsignup_group_slot",
            "event_id",
            "raid_group",
            "group_slot",
            unique=True,
            postgresql_where=text("raid_group IS NOT NULL"),
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
    # The in-game name shown instead of display_name; null shows display_name.
    character_name: Mapped[Optional[str]] = mapped_column(
        String(CHARACTER_NAME_MAX), nullable=True
    )
    # The member's note for the raid leader, read while the raid takes notes
    # (WowRaidEvent.signup_notes_enabled); cleared when their status changes.
    note: Mapped[Optional[str]] = mapped_column(String(NOTE_MAX), nullable=True)
    # The group the leader planned them in (1–8) and their slot in it (1–5).
    raid_group: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    group_slot: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
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
