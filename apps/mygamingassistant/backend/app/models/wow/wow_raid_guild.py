"""WowRaidGuild — per-Discord-guild configuration for the raid signup bot.

One row per Discord guild. Holds the channel to post events into, the role
to ping for signups, the guild's IANA timezone, and JSONB settings for
reminder offsets. No FK to the MGA user table — tenant scope is the Discord
guild, not an MGA account.

discord_guild_id / raid_channel_id / ping_role_id / configured_by_user_id are
Discord snowflake IDs — 64-bit integers serialised as strings to avoid JS
safe-int truncation. Never do arithmetic on them; String(32) is intentional.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Default settings written both as a Python dict and as a server_default
# literal.  Keep the two in sync when adding fields.
_DEFAULT_SETTINGS: dict[str, Any] = {
    # Minutes before raid start to post a signup-nudge channel message.
    "nudge_offsets_minutes": [2880, 1440],  # 48 h, 24 h
    # Minutes before raid start to post the consumables-reminder message.
    "consumables_reminder_minutes": 1440,  # 24 h
    # Minutes before raid start to post the ready-check message.
    "ready_check_minutes": 60,  # 1 h
}

# Use json_build_object rather than a JSONB string literal to avoid
# SQLAlchemy text() treating the colons in JSON "key":value pairs as
# bind-parameter prefixes (`:1440` → NULL in offline SQL rendering).
_DEFAULT_SETTINGS_SQL = (
    "json_build_object("
    "'nudge_offsets_minutes', json_build_array(2880, 1440), "
    "'consumables_reminder_minutes', 1440, "
    "'ready_check_minutes', 60"
    ")"
)


class WowRaidGuild(Base):
    __tablename__ = "wow_raid_guild"
    __table_args__ = (
        UniqueConstraint("discord_guild_id", name="uq_wowraidguild_discord_guild_id"),
        CheckConstraint(
            "char_length(discord_guild_id) >= 1",
            name="ck_wowraidguild_discord_guild_id_nonempty",
        ),
        CheckConstraint(
            "raider_role_ids IS NULL OR jsonb_typeof(raider_role_ids) = 'array'",
            name="ck_wowraidguild_raider_role_ids",
        ),
        CheckConstraint(
            "signup_role_ids IS NULL OR jsonb_typeof(signup_role_ids) = 'array'",
            name="ck_wowraidguild_signup_role_ids",
        ),
        CheckConstraint(
            "banned_role_ids IS NULL OR jsonb_typeof(banned_role_ids) = 'array'",
            name="ck_wowraidguild_banned_role_ids",
        ),
        CheckConstraint(
            "voice_channel_id IS NULL OR voice_channel_id ~ '^[0-9]{15,20}$'",
            name="ck_wowraidguild_voice_channel_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    # Discord snowflake — stored as String(32), never as int.
    discord_guild_id: Mapped[str] = mapped_column(
        String(32), nullable=False
    )
    # Channel where raid events are posted; null until the operator runs /setup.
    raid_channel_id: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True
    )
    # Role to @-mention when a new event is posted.
    ping_role_id: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True
    )
    # IANA tz string, e.g. "America/New_York".  All starts_at values are stored
    # as UTC timestamptz; this is used only for display and computing "same day".
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, default="UTC", server_default="UTC"
    )
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: dict(_DEFAULT_SETTINGS),
        server_default=text(_DEFAULT_SETTINGS_SQL),
    )
    # Discord user ID of whoever ran /setup.
    configured_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True
    )
    # Whether new raids get a Discord event and a thread (/raid-admin setup;
    # migration 0038).  Each raid copies them; its leader can change its own.
    default_discord_event: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    default_thread: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # The roles Raid: Unsigned checks on every raid that hasn't picked its own
    # (/raid-admin raiders; migration 0040); null = none set.  None is stored
    # as SQL NULL, not JSON null, which the check constraint refuses.
    raider_role_ids: Mapped[Optional[list[Any]]] = mapped_column(JSONB(none_as_null=True), nullable=True)
    # Who can sign up for raids that don't set their own (/raid-admin advanced;
    # migration 0041): only these roles (null = everyone), never these (null =
    # nobody).  None is SQL NULL.  The server's ready check is in ``settings``.
    signup_role_ids: Mapped[Optional[list[Any]]] = mapped_column(JSONB(none_as_null=True), nullable=True)
    banned_role_ids: Mapped[Optional[list[Any]]] = mapped_column(JSONB(none_as_null=True), nullable=True)
    # Post options for raids that don't set their own (/raid-admin advanced;
    # migration 0042): pin their posts, and the voice channel the posts name
    # (null = none).
    pin_posts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    voice_channel_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
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
