"""WowCharacterDailyMetric + WowCharacterProfessionSkill + WowCharacterReputation repository.

Standalone functions like the other MGA repositories. The caller owns the
transaction; these only flush.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date
from typing import Any

from sqlalchemy import delete, func, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.wow.character_daily_metric import WowCharacterDailyMetric
from app.models.wow.character_profession_skill import WowCharacterProfessionSkill
from app.models.wow.character_reputation import WowCharacterReputation

# The numbers a fetch writes. ``upsert_daily`` refuses any other.
METRIC_FIELDS = frozenset({
    "level", "item_level", "honorable_kills", "killing_blows", "deaths_from_players",
    "total_kills", "total_deaths", "dungeons_done", "exalted_reputations",
})


async def upsert_daily(db: AsyncSession, character_id: uuid.UUID, day: date, values: dict[str, Any]) -> uuid.UUID:
    """Write the character's numbers for ``day``; returns the row's id.

    A None keeps the day's earlier value: a failed Blizzard call never blanks a number.
    """
    unknown = set(values) - METRIC_FIELDS
    if unknown:
        raise ValueError(f"character_metric_repo.upsert_daily: unknown fields {sorted(unknown)}")
    table = WowCharacterDailyMetric.__table__
    stmt = pg_insert(table).values(character_id=character_id, day=day, **values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_wowcharacterdailymetric_character_day",
        set_={
            **{field: func.coalesce(stmt.excluded[field], table.c[field]) for field in values},
            "updated_at": func.now(),
        },
    ).returning(table.c.id)
    return (await db.execute(stmt)).scalar_one()


async def replace_profession_skills(
    db: AsyncSession, daily_metric_id: uuid.UUID, skills: Sequence[tuple[int, int, int]],
) -> None:
    """Replace the row's profession skills with ``(profession_id, skill, max_skill)`` triples."""
    await db.execute(
        delete(WowCharacterProfessionSkill).where(WowCharacterProfessionSkill.daily_metric_id == daily_metric_id)
    )
    if skills:
        await db.execute(
            insert(WowCharacterProfessionSkill),
            [
                {"daily_metric_id": daily_metric_id, "profession_id": p, "skill": s, "max_skill": m}
                for p, s, m in skills
            ],
        )


async def replace_reputations(
    db: AsyncSession, daily_metric_id: uuid.UUID, standings: Sequence[tuple[int, int, int, int]],
) -> None:
    """Replace the row's reputations with ``(faction_id, tier, value, max)``; the factions must exist."""
    await db.execute(
        delete(WowCharacterReputation).where(WowCharacterReputation.daily_metric_id == daily_metric_id)
    )
    if standings:
        await db.execute(
            insert(WowCharacterReputation),
            [
                {"daily_metric_id": daily_metric_id, "faction_id": f, "tier": t, "value": v, "max": m}
                for f, t, v, m in standings
            ],
        )


async def latest(db: AsyncSession, character_id: uuid.UUID) -> WowCharacterDailyMetric | None:
    """The character's newest daily row."""
    result = await db.execute(
        select(WowCharacterDailyMetric)
        .where(WowCharacterDailyMetric.character_id == character_id)
        .order_by(WowCharacterDailyMetric.day.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def profession_skills(db: AsyncSession, daily_metric_id: uuid.UUID) -> list[WowCharacterProfessionSkill]:
    result = await db.execute(
        select(WowCharacterProfessionSkill)
        .where(WowCharacterProfessionSkill.daily_metric_id == daily_metric_id)
        .order_by(WowCharacterProfessionSkill.profession_id)
    )
    return list(result.scalars())


async def delete_before(db: AsyncSession, before: date) -> int:
    """Delete rows dated before ``before``, except each character's newest; returns how many."""
    newer = aliased(WowCharacterDailyMetric)
    m = WowCharacterDailyMetric
    result = await db.execute(
        delete(m).where(
            m.day < before,
            select(newer.id).where(newer.character_id == m.character_id, newer.day > m.day).exists(),
        )
    )
    return int(result.rowcount or 0)
