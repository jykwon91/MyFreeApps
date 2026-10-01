"""WowRaidMemberPref — per-member default class/role preferences for a guild.

guild_id FK → wow_raid_guild (ON DELETE CASCADE).
UNIQUE(guild_id, discord_user_id) — one preference row per player per guild.

Remembers the class a player most recently signed up with plus, per class,
the spec they play (``saved_specs``), so the next signup is one tap.
``default_role`` is the seat role of that class's saved spec.
dm_opt_out suppresses DM reminders for players who prefer channel-only notices.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Re-use the same tuples from wow_raid_signup to stay consistent.
from app.models.wow.wow_raid_signup import RAID_ROLES, WOW_CLASSES


class WowRaidMemberPref(Base):
    __tablename__ = "wow_raid_member_pref"
    __table_args__ = (
        UniqueConstraint(
            "guild_id", "discord_user_id", name="uq_wowraidmemberpref_guild_user"
        ),
        CheckConstraint(
            f"default_wow_class IS NULL OR default_wow_class IN {WOW_CLASSES!r}",
            name="ck_wowraidmemberpref_wow_class",
        ),
        CheckConstraint(
            f"default_role IS NULL OR default_role IN {RAID_ROLES!r}",
            name="ck_wowraidmemberpref_role",
        ),
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
    discord_user_id: Mapped[str] = mapped_column(String(32), nullable=False)
    # Remembered from the most recent signup; null until first signup.
    default_wow_class: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    default_role: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # class → spec, e.g. {"warrior": "fury", "mage": "frost"}.  Validated on
    # read (raid_catalog.saved_spec); always assign a new dict so the change
    # is detected.
    saved_specs: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    # When true, the worker skips DM notifications for this player.
    dm_opt_out: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
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
