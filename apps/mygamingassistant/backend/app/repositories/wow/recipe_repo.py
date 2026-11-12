"""WowRecipe + WowCharacterRecipe repository — recipes stored characters know.

Standalone functions like the other MGA repositories. The caller owns the
transaction; these only flush.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import delete, func, insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.character_recipe import WowCharacterRecipe
from app.models.wow.recipe import WowRecipe


async def upsert_recipes(db: AsyncSession, recipes: Sequence[tuple[int, int, str]]) -> None:
    """Write ``(recipe id, profession id, name)`` rows, keeping each name current.

    One row per id (the last one given wins: one INSERT can't touch a row
    twice), sorted by id so two characters stored at once lock the rows in the
    same order.
    """
    if not recipes:
        return
    table = WowRecipe.__table__
    by_id = {rid: (pid, name) for rid, pid, name in recipes}
    rows = [{"id": rid, "profession_id": pid, "name": name} for rid, (pid, name) in sorted(by_id.items())]
    stmt = pg_insert(table).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[table.c.id],
        set_={"profession_id": stmt.excluded.profession_id, "name": stmt.excluded.name, "updated_at": func.now()},
        where=(table.c.name != stmt.excluded.name) | (table.c.profession_id != stmt.excluded.profession_id),
    )
    await db.execute(stmt)


async def replace_character_recipes(db: AsyncSession, character_id: uuid.UUID, recipe_ids: Sequence[int]) -> None:
    """The character's known recipes become exactly ``recipe_ids`` (already in ``wow_recipe``)."""
    await db.execute(delete(WowCharacterRecipe).where(WowCharacterRecipe.character_id == character_id))
    ids = sorted(set(recipe_ids))
    if ids:
        await db.execute(insert(WowCharacterRecipe), [{"character_id": character_id, "recipe_id": i} for i in ids])
