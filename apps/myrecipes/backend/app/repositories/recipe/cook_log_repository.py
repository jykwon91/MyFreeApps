"""Repository for ``cook_log``. Queries only; tenant-scoped by ``user_id``.

cook_log has no ``recipe_id`` column (a version belongs to exactly one recipe),
so recipe-level listing joins through ``recipe_version``.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recipe.cook_log import CookLog
from app.models.recipe.recipe_version import RecipeVersion


async def get_by_id(
    db: AsyncSession, cook_id: uuid.UUID, user_id: uuid.UUID,
) -> CookLog | None:
    result = await db.execute(
        select(CookLog).where(CookLog.id == cook_id, CookLog.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_by_version(
    db: AsyncSession, version_id: uuid.UUID, user_id: uuid.UUID,
) -> list[CookLog]:
    result = await db.execute(
        select(CookLog)
        .where(CookLog.version_id == version_id, CookLog.user_id == user_id)
        .order_by(CookLog.cooked_at.desc())
    )
    return list(result.scalars().all())


async def list_by_recipe(
    db: AsyncSession, recipe_id: uuid.UUID, user_id: uuid.UUID,
) -> list[CookLog]:
    result = await db.execute(
        select(CookLog)
        .join(RecipeVersion, CookLog.version_id == RecipeVersion.id)
        .where(RecipeVersion.recipe_id == recipe_id, CookLog.user_id == user_id)
        .order_by(CookLog.cooked_at.desc())
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, cook: CookLog) -> CookLog:
    db.add(cook)
    await db.flush()
    await db.refresh(cook)
    return cook


async def delete(db: AsyncSession, cook: CookLog) -> None:
    await db.delete(cook)
    await db.flush()


async def best_rating_and_last_cooked_by_recipe(
    db: AsyncSession, recipe_ids: list[uuid.UUID],
) -> dict[uuid.UUID, tuple[int | None, object | None]]:
    """{recipe_id: (best_rating, last_cooked_at)} aggregated over all cooks of
    all the recipe's versions. One grouped query for the whole list.
    """
    if not recipe_ids:
        return {}
    result = await db.execute(
        select(
            RecipeVersion.recipe_id,
            func.max(CookLog.rating),
            func.max(CookLog.cooked_at),
        )
        .join(RecipeVersion, CookLog.version_id == RecipeVersion.id)
        .where(RecipeVersion.recipe_id.in_(recipe_ids))
        .group_by(RecipeVersion.recipe_id)
    )
    return {row[0]: (row[1], row[2]) for row in result.all()}


async def counts_and_best_by_version(
    db: AsyncSession, version_ids: list[uuid.UUID],
) -> dict[uuid.UUID, tuple[int, int | None]]:
    """{version_id: (cook_count, best_rating)} for version-timeline summaries."""
    if not version_ids:
        return {}
    result = await db.execute(
        select(CookLog.version_id, func.count(CookLog.id), func.max(CookLog.rating))
        .where(CookLog.version_id.in_(version_ids))
        .group_by(CookLog.version_id)
    )
    return {row[0]: (int(row[1]), row[2]) for row in result.all()}
