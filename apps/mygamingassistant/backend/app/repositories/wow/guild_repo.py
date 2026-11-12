"""WowGuild repository — stored WoW Forever guilds.

Standalone functions like the other MGA repositories. The caller owns the
transaction; these only flush.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import or_, select, true, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.character import WowCharacter
from app.models.wow.character_daily_metric import WowCharacterDailyMetric
from app.models.wow.guild import WowGuild
from app.repositories.wow.guild_member_row import GuildMemberRow


async def upsert(
    db: AsyncSession, *, blizzard_guild_id: int, slug: str, name: str, faction: str, at: datetime, viewed: bool,
) -> uuid.UUID:
    """Insert or refresh the guild Blizzard reported; returns its id.

    ``viewed`` (a member was looked up on a page) stamps ``last_viewed_at``,
    which is what keeps a guild's roster refreshed. A different live guild
    stored under the slug is marked gone first (Blizzard gave the name away):
    one conditional UPDATE, so Postgres re-checks it after any row-lock wait.

    Two *new* guilds under one slug stored at the same moment would make the
    second insert fail ``uq_wowguild_slug_live`` (the look-up still serves its
    page and logs it); the next look-up stores it.
    """
    await db.execute(
        update(WowGuild)
        .where(WowGuild.slug == slug, WowGuild.gone_at.is_(None), WowGuild.blizzard_guild_id != blizzard_guild_id)
        .values(gone_at=at)
    )
    table = WowGuild.__table__
    viewed_at = at if viewed else None
    stmt = pg_insert(table).values(
        blizzard_guild_id=blizzard_guild_id, slug=slug, name=name, faction=faction, last_viewed_at=viewed_at,
    )
    refreshed: dict[str, object] = {"slug": slug, "name": name, "faction": faction, "gone_at": None, "updated_at": at}
    if viewed:
        refreshed["last_viewed_at"] = at
    stmt = stmt.on_conflict_do_update(
        index_elements=[table.c.blizzard_guild_id], set_=refreshed,
    ).returning(table.c.id)
    return (await db.execute(stmt)).scalar_one()


async def touch_viewed(db: AsyncSession, blizzard_guild_id: int, at: datetime) -> None:
    """A person looked up a member (served from the cache): keep the guild watched."""
    await db.execute(
        update(WowGuild)
        .where(WowGuild.blizzard_guild_id == blizzard_guild_id, WowGuild.gone_at.is_(None))
        .values(last_viewed_at=at)
    )


async def due_for_roster(
    db: AsyncSession, *, viewed_since: datetime, checked_before: datetime, limit: int,
) -> list[WowGuild]:
    """The live guilds someone looked at since ``viewed_since`` whose roster
    wasn't asked for since ``checked_before`` — never-asked first, then oldest."""
    result = await db.execute(
        select(WowGuild)
        .where(
            WowGuild.gone_at.is_(None),
            WowGuild.last_viewed_at >= viewed_since,
            or_(WowGuild.roster_checked_at.is_(None), WowGuild.roster_checked_at < checked_before),
        )
        .order_by(WowGuild.roster_checked_at.asc().nulls_first())
        .limit(limit)
    )
    return list(result.scalars())


async def record_roster(db: AsyncSession, guild_id: uuid.UUID, member_count: int, at: datetime) -> None:
    await db.execute(
        update(WowGuild)
        .where(WowGuild.id == guild_id)
        .values(
            member_count=member_count, roster_fetched_at=at, roster_checked_at=at,
            last_error=None, last_error_at=None,
        )
    )


async def record_error(db: AsyncSession, guild_id: uuid.UUID, message: str, at: datetime) -> None:
    await db.execute(
        update(WowGuild)
        .where(WowGuild.id == guild_id)
        .values(roster_checked_at=at, last_error=message, last_error_at=at)
    )


async def mark_gone(db: AsyncSession, guild_id: uuid.UUID, at: datetime) -> None:
    """Blizzard has no such guild: mark it gone and its stored members guildless."""
    await db.execute(update(WowGuild).where(WowGuild.id == guild_id).values(gone_at=at, roster_checked_at=at))
    await db.execute(
        update(WowCharacter).where(WowCharacter.guild_id == guild_id).values(guild_id=None, guild_rank=None)
    )


async def get_by_slug(db: AsyncSession, slug: str) -> WowGuild | None:
    """The live guild with this slug, else the one that most recently had it."""
    result = await db.execute(
        select(WowGuild)
        .where(WowGuild.slug == slug)
        .order_by(WowGuild.gone_at.desc().nulls_first())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def members(db: AsyncSession, guild_id: uuid.UUID) -> list[GuildMemberRow]:
    """The guild's live stored members, each with its newest day's level and item level.

    The newest day is one index read per member (``(character_id, day)``,
    backwards) — never a sort over the 400 days of history kept.
    """
    newest = (
        select(WowCharacterDailyMetric.level, WowCharacterDailyMetric.item_level)
        .where(WowCharacterDailyMetric.character_id == WowCharacter.id)
        .order_by(WowCharacterDailyMetric.day.desc())
        .limit(1)
        .lateral()
    )
    result = await db.execute(
        select(
            WowCharacter.slug,
            WowCharacter.name,
            WowCharacter.surname,
            WowCharacter.class_id,
            WowCharacter.guild_rank,
            WowCharacter.fetched_at,
            newest.c.level,
            newest.c.item_level,
        )
        .outerjoin(newest, true())
        .where(WowCharacter.guild_id == guild_id, WowCharacter.gone_at.is_(None))
        .order_by(WowCharacter.slug)
    )
    return [GuildMemberRow(*row) for row in result.all()]
