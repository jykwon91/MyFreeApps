"""Repository for ``recipe_version`` + its ``recipe_ingredient`` / ``recipe_step``
snapshot rows. Queries only; tenant-scoped by ``user_id`` where the table
carries it.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recipe.recipe_ingredient import RecipeIngredient
from app.models.recipe.recipe_step import RecipeStep
from app.models.recipe.recipe_version import RecipeVersion


async def get_by_id(
    db: AsyncSession, version_id: uuid.UUID, user_id: uuid.UUID,
) -> RecipeVersion | None:
    result = await db.execute(
        select(RecipeVersion).where(
            RecipeVersion.id == version_id, RecipeVersion.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_by_recipe(
    db: AsyncSession, recipe_id: uuid.UUID, user_id: uuid.UUID,
) -> list[RecipeVersion]:
    """All versions of a recipe, oldest first (the timeline order)."""
    result = await db.execute(
        select(RecipeVersion)
        .where(RecipeVersion.recipe_id == recipe_id, RecipeVersion.user_id == user_id)
        .order_by(RecipeVersion.version_number.asc())
    )
    return list(result.scalars().all())


async def get_latest(
    db: AsyncSession, recipe_id: uuid.UUID, user_id: uuid.UUID,
) -> RecipeVersion | None:
    """The current version = the highest version_number."""
    result = await db.execute(
        select(RecipeVersion)
        .where(RecipeVersion.recipe_id == recipe_id, RecipeVersion.user_id == user_id)
        .order_by(RecipeVersion.version_number.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def max_version_number(db: AsyncSession, recipe_id: uuid.UUID) -> int:
    """Highest version_number for a recipe, or 0 if none yet."""
    result = await db.execute(
        select(func.coalesce(func.max(RecipeVersion.version_number), 0)).where(
            RecipeVersion.recipe_id == recipe_id
        )
    )
    return int(result.scalar_one())


async def create(db: AsyncSession, version: RecipeVersion) -> RecipeVersion:
    db.add(version)
    await db.flush()
    await db.refresh(version)
    return version


async def add_ingredients(db: AsyncSession, ingredients: list[RecipeIngredient]) -> None:
    if ingredients:
        db.add_all(ingredients)
        await db.flush()


async def add_steps(db: AsyncSession, steps: list[RecipeStep]) -> None:
    if steps:
        db.add_all(steps)
        await db.flush()


async def get_ingredients(db: AsyncSession, version_id: uuid.UUID) -> list[RecipeIngredient]:
    result = await db.execute(
        select(RecipeIngredient)
        .where(RecipeIngredient.version_id == version_id)
        .order_by(RecipeIngredient.position.asc())
    )
    return list(result.scalars().all())


async def get_steps(db: AsyncSession, version_id: uuid.UUID) -> list[RecipeStep]:
    result = await db.execute(
        select(RecipeStep)
        .where(RecipeStep.version_id == version_id)
        .order_by(RecipeStep.position.asc())
    )
    return list(result.scalars().all())


async def counts_and_latest_by_recipe(
    db: AsyncSession, recipe_ids: list[uuid.UUID],
) -> dict[uuid.UUID, tuple[int, int]]:
    """{recipe_id: (version_count, latest_version_number)} for the given recipes.

    One grouped query — avoids an N+1 across the recipes list.
    """
    if not recipe_ids:
        return {}
    result = await db.execute(
        select(
            RecipeVersion.recipe_id,
            func.count(RecipeVersion.id),
            func.max(RecipeVersion.version_number),
        )
        .where(RecipeVersion.recipe_id.in_(recipe_ids))
        .group_by(RecipeVersion.recipe_id)
    )
    return {row[0]: (int(row[1]), int(row[2])) for row in result.all()}
