"""Zone density — per-zone lineup counts grouped by utility-type slug."""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.lineup import Lineup
from app.models.game.utility_type import UtilityType


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
