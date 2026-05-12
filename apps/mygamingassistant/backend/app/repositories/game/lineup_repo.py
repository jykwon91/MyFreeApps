"""Lineup repository — all ORM operations for the lineup table.

Filters follow "any" semantics for side: a lineup with side='any' always
appears in side_a and side_b queries, so players see utility that works
on both sides.

All filter parameters are optional. Omitting them returns all rows that
pass the status filter (default: accepted only).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game.lineup import Lineup


@dataclass
class LineupFilters:
    game_id: Optional[uuid.UUID] = None
    map_id: Optional[uuid.UUID] = None
    target_zone_id: Optional[uuid.UUID] = None
    stand_zone_id: Optional[uuid.UUID] = None
    # "side_a", "side_b", or None (no filter)
    side: Optional[str] = None
    utility_type_ids: list[uuid.UUID] = field(default_factory=list)
    # None → only "accepted"; set explicitly to bypass
    status: Optional[str] = "accepted"


def _apply_filters(stmt: "Select[tuple[Lineup]]", f: LineupFilters) -> "Select[tuple[Lineup]]":
    if f.status is not None:
        stmt = stmt.where(Lineup.status == f.status)
    if f.game_id is not None:
        stmt = stmt.where(Lineup.game_id == f.game_id)
    if f.map_id is not None:
        stmt = stmt.where(Lineup.map_id == f.map_id)
    if f.target_zone_id is not None:
        stmt = stmt.where(Lineup.target_zone_id == f.target_zone_id)
    if f.stand_zone_id is not None:
        stmt = stmt.where(Lineup.stand_zone_id == f.stand_zone_id)
    if f.side is not None:
        # "any" semantics: lineup.side='any' always matches regardless of the
        # requested side.
        stmt = stmt.where(Lineup.side.in_([f.side, "any"]))
    if f.utility_type_ids:
        stmt = stmt.where(Lineup.utility_type_id.in_(f.utility_type_ids))
    return stmt


async def create_lineup(db: AsyncSession, data: dict) -> Lineup:
    """Insert a new lineup row and return the refreshed ORM instance."""
    lineup = Lineup(**data)
    db.add(lineup)
    await db.flush()
    await db.refresh(lineup, attribute_names=["target_zone", "stand_zone", "utility_type"])
    return lineup


async def list_lineups(
    db: AsyncSession,
    filters: LineupFilters,
) -> list[Lineup]:
    """Return lineups matching *filters*, eager-loading FK relations."""
    stmt = (
        select(Lineup)
        .options(
            selectinload(Lineup.target_zone),
            selectinload(Lineup.stand_zone),
            selectinload(Lineup.utility_type),
        )
        .order_by(Lineup.created_at.desc())
    )
    stmt = _apply_filters(stmt, filters)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_lineup(
    db: AsyncSession,
    lineup_id: uuid.UUID,
) -> Lineup | None:
    """Return a single lineup by id, or None."""
    stmt = (
        select(Lineup)
        .where(Lineup.id == lineup_id)
        .options(
            selectinload(Lineup.target_zone),
            selectinload(Lineup.stand_zone),
            selectinload(Lineup.utility_type),
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_lineup(
    db: AsyncSession,
    lineup: Lineup,
    patch: dict,
) -> Lineup:
    """Apply *patch* fields to *lineup* and flush."""
    for key, value in patch.items():
        setattr(lineup, key, value)
    await db.flush()
    await db.refresh(lineup, attribute_names=["target_zone", "stand_zone", "utility_type"])
    return lineup


async def hide_lineup(db: AsyncSession, lineup: Lineup) -> Lineup:
    """Soft-delete: set status='hidden'."""
    lineup.status = "hidden"
    await db.flush()
    return lineup


async def zone_density(
    db: AsyncSession,
    map_id: uuid.UUID,
    side: Optional[str],
    utility_type_ids: list[uuid.UUID],
) -> dict[str, dict]:
    """Return per-zone lineup counts, grouped by utility_type slug.

    Returns a dict keyed by target_zone_id (as string):
      {
        "<zone_id>": {
          "count": 3,
          "by_utility": {"smoke": 2, "flash": 1}
        }
      }
    """
    from app.models.game.utility_type import UtilityType

    stmt = (
        select(
            Lineup.target_zone_id,
            UtilityType.slug.label("util_slug"),
            func.count().label("cnt"),
        )
        .join(UtilityType, Lineup.utility_type_id == UtilityType.id)
        .where(
            Lineup.map_id == map_id,
            Lineup.status == "accepted",
        )
        .group_by(Lineup.target_zone_id, UtilityType.slug)
    )
    if side is not None:
        stmt = stmt.where(Lineup.side.in_([side, "any"]))
    if utility_type_ids:
        stmt = stmt.where(Lineup.utility_type_id.in_(utility_type_ids))

    rows = (await db.execute(stmt)).all()

    result: dict[str, dict] = {}
    for zone_id, util_slug, cnt in rows:
        key = str(zone_id)
        if key not in result:
            result[key] = {"count": 0, "by_utility": {}}
        result[key]["count"] += cnt
        result[key]["by_utility"][util_slug] = result[key]["by_utility"].get(util_slug, 0) + cnt

    return result
