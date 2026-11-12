"""WowFaction repository — faction names by Blizzard id.

Standalone functions like the other MGA repositories. The caller owns the
transaction; these only flush.
"""
from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.faction import WowFaction


async def upsert_factions(db: AsyncSession, factions: Sequence[tuple[int, str]]) -> None:
    """Insert or rename ``(faction_id, name)`` pairs, in id order (no deadlock between two stores)."""
    if not factions:
        return
    unique = dict(sorted(factions))
    table = WowFaction.__table__
    stmt = pg_insert(table).values([{"id": i, "name": n} for i, n in unique.items()])
    stmt = stmt.on_conflict_do_update(
        index_elements=[table.c.id],
        set_={"name": stmt.excluded.name, "updated_at": func.now()},
        where=table.c.name != stmt.excluded.name,
    )
    await db.execute(stmt)
