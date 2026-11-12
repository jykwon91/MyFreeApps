"""WowGuild repository — stored WoW Forever guilds.

Standalone functions like the other MGA repositories. The caller owns the
transaction; these only flush.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, datetime

from sqlalchemy import case, func, or_, select, true, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.wow.character import WowCharacter
from app.models.wow.character_daily_metric import WowCharacterDailyMetric
from app.models.wow.character_profession_skill import WowCharacterProfessionSkill
from app.models.wow.guild import WowGuild
from app.repositories.wow.guild_member_row import GuildMemberRow
from app.repositories.wow.guild_member_skill_row import GuildMemberSkillRow


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


async def members(db: AsyncSession, guild_id: uuid.UUID, *, gains_since: date) -> list[GuildMemberRow]:
    """The guild's live stored members, each with its newest day's numbers and a gains baseline.

    The newest day is one index read per member (``(character_id, day)``,
    backwards) — never a sort over the 400 days of history kept.

    The baseline is the member's newest day at or before ``gains_since``, else
    their earliest day — always older than their newest day, and only for a
    member whose newest day is after ``gains_since`` (nobody looked up in the
    window gained nothing we saw).
    """
    m = WowCharacterDailyMetric
    later = aliased(WowCharacterDailyMetric)
    newest_day = (
        select(func.max(later.day)).where(later.character_id == WowCharacter.id).correlate(WowCharacter).scalar_subquery()
    )
    baseline = (
        select(
            m.day.label("baseline_day"),
            m.level.label("baseline_level"),
            m.honorable_kills.label("baseline_honorable_kills"),
            m.killing_blows.label("baseline_killing_blows"),
            m.total_kills.label("baseline_total_kills"),
            m.dungeons_done.label("baseline_dungeons_done"),
        )
        .where(m.character_id == WowCharacter.id, m.day < newest_day, newest_day > gains_since)
        # Days in the window's past first, newest of them; else the earliest day.
        .order_by(case((m.day <= gains_since, m.day), else_=None).desc().nulls_last(), m.day.asc())
        .limit(1)
        .lateral()
    )
    newest = (
        select(
            m.level, m.item_level, m.honorable_kills, m.killing_blows, m.deaths_from_players,
            m.total_kills, m.total_deaths, m.dungeons_done, m.exalted_reputations,
        )
        .where(m.character_id == WowCharacter.id)
        .order_by(m.day.desc())
        .limit(1)
        .lateral()
    )
    result = await db.execute(
        select(
            WowCharacter.slug,
            WowCharacter.name,
            WowCharacter.surname,
            WowCharacter.class_id,
            WowCharacter.guild_rank.label("rank"),
            WowCharacter.fetched_at,
            *newest.c,
            *baseline.c,
        )
        .select_from(WowCharacter)
        .outerjoin(newest, true())
        .outerjoin(baseline, true())
        .where(WowCharacter.guild_id == guild_id, WowCharacter.gone_at.is_(None))
        .order_by(WowCharacter.slug)
    )
    return [GuildMemberRow(**row._mapping) for row in result.all()]


async def member_skills(
    db: AsyncSession, guild_id: uuid.UUID, *, slugs: Sequence[str] | None = None,
) -> list[GuildMemberSkillRow]:
    """The live stored members' profession skills, each from the member's newest day that has any.

    A day whose professions call failed stores no skills, so the newest day with
    skills — not the newest day — holds the member's latest known professions.
    ``slugs`` limits it to those members (the recipe search's crafters).
    """
    m = WowCharacterDailyMetric
    skill = WowCharacterProfessionSkill
    newest_with_skills = (
        select(m.id)
        .where(m.character_id == WowCharacter.id, select(skill.id).where(skill.daily_metric_id == m.id).exists())
        .order_by(m.day.desc())
        .limit(1)
        .lateral()
    )
    stmt = (
        select(WowCharacter.slug, skill.profession_id, skill.skill, skill.max_skill)
        .select_from(WowCharacter)
        .join(newest_with_skills, true())
        .join(skill, skill.daily_metric_id == newest_with_skills.c.id)
        .where(WowCharacter.guild_id == guild_id, WowCharacter.gone_at.is_(None))
        .order_by(WowCharacter.slug, skill.profession_id)
    )
    if slugs is not None:
        stmt = stmt.where(WowCharacter.slug.in_(slugs))
    result = await db.execute(stmt)
    return [GuildMemberSkillRow(*row) for row in result.all()]
