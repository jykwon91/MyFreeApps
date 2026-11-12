"""WowGuild — a WoW Forever guild whose members are looked up on "Your character".

Stored the first time a member is looked up; its roster is then refreshed on
a schedule while someone keeps looking (``last_viewed_at``). Forever guilds
have no realm, so the slug alone names one. A guild Blizzard no longer has is
marked gone and its members leave it. Public game data, so no user FK.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Index, SmallInteger, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.wow_character import CHARACTER_ERROR_MAX_LENGTH
from app.core.wow_guild import GUILD_NAME_MAX_LENGTH, GUILD_SLUG_MAX_LENGTH
from app.db.base import Base


class WowGuild(Base):
    __tablename__ = "wow_guild"
    __table_args__ = (
        CheckConstraint("slug = lower(slug)", name="ck_wowguild_slug_lower"),
        CheckConstraint("faction IN ('ALLIANCE', 'HORDE')", name="ck_wowguild_faction"),
        # One live guild per slug; a gone row keeps its slug.
        Index("uq_wowguild_slug_live", "slug", unique=True, postgresql_where=text("gone_at IS NULL")),
        Index("ix_wowguild_last_viewed_at", "last_viewed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    blizzard_guild_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(GUILD_SLUG_MAX_LENGTH), nullable=False)
    name: Mapped[str] = mapped_column(String(GUILD_NAME_MAX_LENGTH), nullable=False)
    faction: Mapped[str] = mapped_column(String(10), nullable=False)
    member_count: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    # Last time someone looked up a member on a page; None when only the scheduler
    # has seen the guild (a member moved to it), which never makes it refreshed.
    last_viewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Last time Blizzard sent the roster.
    roster_fetched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Last time the scheduler asked for the roster at all, whatever the answer.
    roster_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(String(CHARACTER_ERROR_MAX_LENGTH), nullable=True)
    last_error_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    gone_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
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
