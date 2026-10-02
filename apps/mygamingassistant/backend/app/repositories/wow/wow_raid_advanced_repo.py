"""Raid: Edit → Advanced and /raid-admin advanced — the settings' writes, and the raids that follow the server.

Each setter assigns and flushes; the caller owns the transaction (and, for a
raid, holds its row lock).  A role list of None is SQL NULL: the raid follows
the server, the server falls back to the built-in default.  ``[]`` is a
raid's own "everyone" (allowed) or "nobody" (banned).  The server's ready
check lives in ``wow_raid_guild.settings`` (``wow_raid_guild_repo.upsert_config``).
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any, Final, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild

# Which role list: who may join (``signup``), or who may not (``banned``).
RoleList = Literal["signup", "banned"]
# The raid columns a server change reaches, on the raids that leave them NULL.
_FOLLOWING: Final[dict[str, Any]] = {"signup_role_ids": WowRaidEvent.signup_role_ids}


async def set_min_signups(db: AsyncSession, event: WowRaidEvent, value: int | None) -> None:
    """The raid's minimum sign-ups; None = no minimum."""
    event.min_signups = value
    await db.flush()


async def set_event_roles(
    db: AsyncSession, event: WowRaidEvent, *, which: RoleList, role_ids: Sequence[str] | None
) -> None:
    """The raid's own allowed or banned list; None = follow the server."""
    stored = _stored(role_ids)
    if which == "signup":
        event.signup_role_ids = stored
    else:
        event.banned_role_ids = stored
    await db.flush()


async def set_guild_roles(
    db: AsyncSession, guild: WowRaidGuild, *, which: RoleList, role_ids: Sequence[str] | None
) -> None:
    """The server's allowed or banned list; None = everyone may join / nobody is kept out."""
    stored = _stored(role_ids)
    if which == "signup":
        guild.signup_role_ids = stored
    else:
        guild.banned_role_ids = stored
    await db.flush()


async def set_ready_check(db: AsyncSession, event: WowRaidEvent, minutes: int | None) -> None:
    """The raid's ready check, in minutes before the start (0 = none); None = follow the server."""
    event.ready_check_minutes = minutes
    await db.flush()


async def list_open_following(
    db: AsyncSession, guild_id: uuid.UUID, column: str, *, limit: int = 25
) -> list[uuid.UUID]:
    """The guild's posted raids still to start that leave *column* to the server (NULL), soonest first."""
    result = await db.execute(
        select(WowRaidEvent.id)
        .where(
            WowRaidEvent.guild_id == guild_id,
            WowRaidEvent.status == "scheduled",
            WowRaidEvent.message_id.is_not(None),
            WowRaidEvent.start_applied_at.is_(None),
            _FOLLOWING[column].is_(None),
        )
        .order_by(WowRaidEvent.starts_at)
        .limit(limit)
    )
    return list(result.scalars())


def _stored(role_ids: Sequence[str] | None) -> list[str] | None:
    if role_ids is None:
        return None
    return list(role_ids)
