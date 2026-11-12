"""WowRecipe + WowCharacterRecipe repository — recipes stored characters know.

Standalone functions like the other MGA repositories. The caller owns the
transaction; these only flush.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import delete, func, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.character import WowCharacter
from app.models.wow.character_recipe import WowCharacterRecipe
from app.models.wow.recipe import WowRecipe
from app.repositories.wow.guild_crafter_row import GuildCrafterRow
from app.repositories.wow.guild_recipe_row import GuildRecipeRow


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


async def guild_recipes_matching(
    db: AsyncSession, guild_id: uuid.UUID, text: str, *, excluded_profession_ids: frozenset[int], limit: int,
) -> list[GuildRecipeRow]:
    """Recipes whose name contains ``text`` (any case) that a live member of the guild knows, by name.

    Returns up to ``limit``; the caller asks for one more to know there were more.
    """
    known_in_guild = (
        select(WowCharacterRecipe.recipe_id)
        .join(WowCharacter, WowCharacter.id == WowCharacterRecipe.character_id)
        .where(
            WowCharacterRecipe.recipe_id == WowRecipe.id,
            WowCharacter.guild_id == guild_id,
            WowCharacter.gone_at.is_(None),
        )
        .exists()
    )
    result = await db.execute(
        select(WowRecipe.id, WowRecipe.name, WowRecipe.profession_id)
        .where(
            # autoescape: LIKE's own wildcards in ``text`` are taken literally.
            WowRecipe.name.icontains(text, autoescape=True),
            WowRecipe.profession_id.not_in(excluded_profession_ids),
            known_in_guild,
        )
        .order_by(WowRecipe.name, WowRecipe.id)
        .limit(limit)
    )
    return [GuildRecipeRow(**row._mapping) for row in result.all()]


async def guild_crafters(db: AsyncSession, guild_id: uuid.UUID, recipe_ids: Sequence[int]) -> list[GuildCrafterRow]:
    """The guild's live members who know each of ``recipe_ids``."""
    if not recipe_ids:
        return []
    result = await db.execute(
        select(
            WowCharacterRecipe.recipe_id, WowCharacter.slug, WowCharacter.name, WowCharacter.surname, WowCharacter.class_id,
        )
        .join(WowCharacter, WowCharacter.id == WowCharacterRecipe.character_id)
        .where(
            WowCharacterRecipe.recipe_id.in_(recipe_ids),
            WowCharacter.guild_id == guild_id,
            WowCharacter.gone_at.is_(None),
        )
        .order_by(WowCharacterRecipe.recipe_id, WowCharacter.slug)
    )
    return [GuildCrafterRow(**row._mapping) for row in result.all()]
