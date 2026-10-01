"""Pydantic schemas for the WoW raid signup bot data layer.

Kept close to the model constants so changes to the DB enums automatically
surface as schema validation errors without a separate update pass.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.wow.wow_raid_event import RAID_KEYS, RAID_STATUSES
from app.models.wow.wow_raid_member_pref import WowRaidMemberPref as _PrefModel
from app.models.wow.wow_raid_notification import NOTIFICATION_KINDS
from app.models.wow.wow_raid_signup import RAID_ROLES, SIGNUP_STATUSES, WOW_CLASSES

# ---------------------------------------------------------------------------
# Shared field types
# ---------------------------------------------------------------------------

DiscordSnowflake = str  # String(32); no arithmetic.

# ---------------------------------------------------------------------------
# WowRaidGuild
# ---------------------------------------------------------------------------

_REQUIRED_SETTINGS_KEYS = frozenset(
    ["nudge_offsets_minutes", "consumables_reminder_minutes", "ready_check_minutes"]
)


class RaidGuildSettings(BaseModel):
    """The guild-level settings blob stored in wow_raid_guild.settings."""

    model_config = ConfigDict(extra="forbid")

    nudge_offsets_minutes: list[int] = Field(
        default_factory=lambda: [2880, 1440],
        description="Minutes before raid start to post signup nudge messages.",
    )
    consumables_reminder_minutes: int = Field(
        default=1440,
        ge=0,
        description="Minutes before raid start to post the consumables reminder.",
    )
    ready_check_minutes: int = Field(
        default=60,
        ge=0,
        description="Minutes before raid start to post the ready-check message.",
    )

    @field_validator("nudge_offsets_minutes")
    @classmethod
    def _nudge_offsets_positive(cls, v: list[int]) -> list[int]:
        if any(x < 0 for x in v):
            raise ValueError("nudge_offsets_minutes must all be non-negative")
        return v


class RaidGuildRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    discord_guild_id: DiscordSnowflake
    raid_channel_id: Optional[DiscordSnowflake]
    ping_role_id: Optional[DiscordSnowflake]
    timezone: str
    settings: dict[str, Any]
    configured_by_user_id: Optional[DiscordSnowflake]
    created_at: datetime
    updated_at: datetime


class RaidGuildUpsert(BaseModel):
    """Request body for /setup or guild config update."""

    model_config = ConfigDict(extra="forbid")

    raid_channel_id: Optional[DiscordSnowflake] = None
    ping_role_id: Optional[DiscordSnowflake] = None
    timezone: str = "UTC"
    settings: Optional[RaidGuildSettings] = None
    configured_by_user_id: Optional[DiscordSnowflake] = None


# ---------------------------------------------------------------------------
# WowRaidEvent
# ---------------------------------------------------------------------------

RaidKey = str  # validated against RAID_KEYS
RaidStatus = str  # validated against RAID_STATUSES


class RaidEventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raid_key: RaidKey
    starts_at: datetime
    size_cap: int = Field(default=25, ge=1, le=40)
    channel_id: DiscordSnowflake
    created_by_user_id: DiscordSnowflake
    title: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = None

    @field_validator("raid_key")
    @classmethod
    def _valid_raid_key(cls, v: str) -> str:
        if v not in RAID_KEYS:
            raise ValueError(f"raid_key must be one of {RAID_KEYS}")
        return v


class RaidEventRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    guild_id: uuid.UUID
    raid_key: str
    title: Optional[str]
    starts_at: datetime
    size_cap: int
    status: str
    channel_id: str
    message_id: Optional[str]
    created_by_user_id: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# WowRaidSignup
# ---------------------------------------------------------------------------

WowClass = str  # validated against WOW_CLASSES
RaidRole = str  # validated against RAID_ROLES
SignupStatus = str  # validated against SIGNUP_STATUSES


class RaidSignupUpsert(BaseModel):
    """Payload when a player clicks the signup button."""

    model_config = ConfigDict(extra="forbid")

    discord_user_id: DiscordSnowflake
    display_name: str = Field(min_length=1, max_length=100)
    status: SignupStatus
    wow_class: Optional[WowClass] = None
    role: Optional[RaidRole] = None

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str) -> str:
        if v not in SIGNUP_STATUSES:
            raise ValueError(f"status must be one of {SIGNUP_STATUSES}")
        return v

    @field_validator("wow_class")
    @classmethod
    def _valid_class(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in WOW_CLASSES:
            raise ValueError(f"wow_class must be one of {WOW_CLASSES}")
        return v

    @field_validator("role")
    @classmethod
    def _valid_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in RAID_ROLES:
            raise ValueError(f"role must be one of {RAID_ROLES}")
        return v


class RaidSignupRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    discord_user_id: str
    display_name: str
    wow_class: Optional[str]
    role: Optional[str]
    status: str
    signed_up_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# WowRaidMemberPref
# ---------------------------------------------------------------------------


class MemberPrefUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")

    default_wow_class: Optional[WowClass] = None
    default_role: Optional[RaidRole] = None
    dm_opt_out: bool = False

    @field_validator("default_wow_class")
    @classmethod
    def _valid_class(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in WOW_CLASSES:
            raise ValueError(f"default_wow_class must be one of {WOW_CLASSES}")
        return v

    @field_validator("default_role")
    @classmethod
    def _valid_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in RAID_ROLES:
            raise ValueError(f"default_role must be one of {RAID_ROLES}")
        return v


class MemberPrefRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    guild_id: uuid.UUID
    discord_user_id: str
    default_wow_class: Optional[str]
    default_role: Optional[str]
    dm_opt_out: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# WowRaidNotification
# ---------------------------------------------------------------------------


class NotificationRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    kind: str
    target_user_id: Optional[str]
    due_at: datetime
    sent_at: Optional[datetime]
    attempts: int
    last_error: Optional[str]
    claimed_at: Optional[datetime]
    created_at: datetime
