"""WowRaidEvent — a scheduled Classic/Forever raid on a Discord guild.

guild_id FK → wow_raid_guild (ON DELETE CASCADE).
starts_at is stored as UTC timestamptz; the guild's timezone is used for
display only.  message_id is null until the bot posts the signup embed.

Lifecycle: draft (organiser preview) → scheduled (posted) → cancelled /
completed.  Migration 0026 added ``draft``.

raid_key is a short slug identifying the instance (mc, onyxia, etc.).  title
overrides the default display name if set.

series_id FK → wow_raid_series (ON DELETE SET NULL): the repeat the raid is
in (migration 0037).

The Discord event and thread columns (0038) are written by
``raid_extras`` through the repo's setters; read them through
``raid_extras_rules``.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Final, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
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
# ``draft`` = created by /raid-admin create, shown only in the organiser's
# private preview; flipped to ``scheduled`` when they press [Post raid].
RAID_STATUSES = ("draft", "scheduled", "cancelled", "completed")
# Why sign-ups are closed (``closed_at``): Raid: Close, or the sign-up deadline.
CLOSE_REASONS = ("leader", "deadline")
# How long a raid can run, in minutes (Event & thread → Length); null = 3 hours.
LENGTH_RANGE: Final = (15, 360)


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
        CheckConstraint(
            "color IS NULL OR (color >= 0 AND color <= 16777215)",
            name="ck_wowraidevent_color",
        ),
        CheckConstraint(
            "mention_role_ids IS NULL OR jsonb_typeof(mention_role_ids) = 'array'",
            name="ck_wowraidevent_mention_role_ids",
        ),
        CheckConstraint(
            "role_limits IS NULL OR jsonb_typeof(role_limits) = 'object'",
            name="ck_wowraidevent_role_limits",
        ),
        CheckConstraint(
            "class_limits IS NULL OR jsonb_typeof(class_limits) = 'object'",
            name="ck_wowraidevent_class_limits",
        ),
        CheckConstraint(
            "signup_deadline_minutes IS NULL OR signup_deadline_minutes BETWEEN 1 AND 10080",
            name="ck_wowraidevent_signup_deadline",
        ),
        CheckConstraint(
            f"close_reason IS NULL OR close_reason IN {CLOSE_REASONS!r}",
            name="ck_wowraidevent_close_reason",
        ),
        CheckConstraint(
            f"length_minutes IS NULL OR length_minutes BETWEEN {LENGTH_RANGE[0]} AND {LENGTH_RANGE[1]}",
            name="ck_wowraidevent_length_minutes",
        ),
        # Efficiently list upcoming events per guild.
        Index("ix_wowraidevent_guild_starts_at", "guild_id", "starts_at"),
        # A repeat's latest raid (raid_series_service.template).
        Index("ix_wowraidevent_series_id", "series_id"),
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
    # Seats (confirmed + late) before new seat requests are queued (1–40).
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
    # Creator's display name at creation time — embed footers can't render
    # <@id> mentions, so the name is captured once.
    created_by_display_name: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Shown on the cancelled embed; written by /raid-admin cancel.
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Set by Raid: Close or by the deadline (0036), cleared by Raid: Open
    # (migration 0030).  A closed raid stays ``scheduled``; members just can't
    # change their sign-up.
    closed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Who closed them: 'leader' (Raid: Close) or 'deadline'; null while open (0036).
    close_reason: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    # How long before the start sign-ups close (1–10080 minutes); null = at
    # the start (migration 0036).  Read through raid_deadline.
    signup_deadline_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # When the bot applied the deadline (closed sign-ups, or found them
    # closed); null while it's ahead or unset.  Makes the worker's sweep
    # once-only and a reopen after the deadline stick.
    deadline_applied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # When the worker re-rendered the post as started; cleared if the raid
    # moves into the future.
    start_applied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # When Ping signed members last went out — at most one ping every few minutes.
    last_pinged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Who leads the raid once someone hands it over (Raid: Edit → Leader);
    # null = whoever created it (migration 0031).
    leader_user_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    leader_display_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # A banner link replacing the raid's own banner (https only); null = the raid's.
    image_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    # The post's color while sign-ups are open (0xRRGGBB); null = the default purple.
    color: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # The roles the raid pings (first post, nudges); null = the server's ping
    # role, [] = nobody (migration 0032).  Read through raid_details.mention_roles.
    mention_role_ids: Mapped[Optional[list[Any]]] = mapped_column(JSONB, nullable=True)
    # How many players may come as each role ({"tank": 2, …}) and in each class
    # column ({"rogue": 3, …}); a missing key or null = no limit (migration 0033).
    # Read through raid_limits.Limits.of.  None is stored as SQL NULL, not JSON
    # null, which the check constraints refuse.
    role_limits: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB(none_as_null=True), nullable=True)
    class_limits: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB(none_as_null=True), nullable=True)
    # Whether members can leave the leader a note (Raid: Edit → Notes, migration
    # 0035).  Off hides the notes already written; they stay on the sign-ups.
    signup_notes_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # The repeat the raid is in: the raid it was turned on from, and each one
    # it posted; null = not in one, or the repeat stopped (migration 0037).
    series_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wow_raid_series.id", ondelete="SET NULL", name="fk_wowraidevent_series"),
        nullable=True,
    )
    # Discord event + thread (0038).  The leader's toggles, copied from the
    # server's defaults when the raid is made.
    discord_event_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    thread_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # How long the raid runs (LENGTH_RANGE); null = 3 hours.  Sets the event's end.
    length_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # The scheduled event the bot made or adopted, the sha256 of the last
    # payload Discord took (an unchanged raid sends no PATCH) and the start
    # Discord holds (passed = Discord has started the event).
    discord_event_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    discord_event_digest: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    discord_event_starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # A create in flight: one event per raid; stale after two minutes, when
    # the next sync looks for it before making another.
    discord_event_claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # The code Discord refused the event with; nothing retries until the
    # leader taps Try again or turns the event on.
    discord_event_error: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # The thread on the post (its id is the post's message id) and the name
    # the bot gave it; null name with an id = a member's thread, left alone.
    thread_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    thread_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    thread_error: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
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
