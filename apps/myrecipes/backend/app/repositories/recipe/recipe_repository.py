"""Repository for ``recipe`` — owns every query against the table.

Routes never touch the ORM, services orchestrate, repositories return ORM
rows. Every public function takes ``user_id`` and filters by it — tenant
scoping is mandatory. Recipes are SOFT-deleted, so reads exclude
``deleted_at IS NOT NULL`` rows.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recipe.recipe import Recipe

# Columns a PATCH may touch. Tenant + server-managed columns are excluded
# (defense in depth on top of the schema's extra='forbid').
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({"title", "description", "source"})


async def get_by_id(
    db: AsyncSession, recipe_id: uuid.UUID, user_id: uuid.UUID,
) -> Recipe | None:
    """Return the recipe iff it belongs to ``user_id`` and is not soft-deleted."""
    result = await db.execute(
        select(Recipe).where(
            Recipe.id == recipe_id,
            Recipe.user_id == user_id,
            Recipe.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def list_by_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    search: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[Recipe]:
    """List a user's non-deleted recipes, most-recently-updated first.

    Tenant-scoped: always filters by ``user_id``. Backs the authenticated
    ``owner=me`` view on the public list route.

    Optional ``search``: case-insensitive substring on ``title``.
    Optional ``limit``/``offset``: page the result set (offset ignored when
    limit is None).
    """
    stmt = select(Recipe).where(Recipe.user_id == user_id, Recipe.deleted_at.is_(None))
    if search is not None and search.strip():
        stmt = stmt.where(Recipe.title.ilike(f"%{search.strip()}%"))
    stmt = stmt.order_by(Recipe.updated_at.desc())
    if limit is not None:
        stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_public(
    db: AsyncSession,
    *,
    search: str | None = None,
    limit: int,
    offset: int = 0,
) -> list[Recipe]:
    """List every non-deleted recipe, most-recently-updated first.

    Public read: deliberately NOT tenant-scoped — anyone may browse the
    recipe library. Dedicated function (never a ``user_id=None`` overload of
    :func:`list_by_user`) so a tenant-scoped write path can never accidentally
    fall through to an unscoped query. Always paginated.

    Optional ``search``: case-insensitive substring on ``title`` (bind param).
    """
    stmt = select(Recipe).where(Recipe.deleted_at.is_(None))
    if search is not None and search.strip():
        stmt = stmt.where(Recipe.title.ilike(f"%{search.strip()}%"))
    stmt = stmt.order_by(Recipe.updated_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_public_by_id(db: AsyncSession, recipe_id: uuid.UUID) -> Recipe | None:
    """Return a non-deleted recipe by id, with NO tenant filter.

    Public read companion to :func:`get_by_id`. A soft-deleted or missing
    recipe returns ``None`` (the route maps both to an identical 404).
    """
    result = await db.execute(
        select(Recipe).where(
            Recipe.id == recipe_id,
            Recipe.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def create(db: AsyncSession, recipe: Recipe) -> Recipe:
    db.add(recipe)
    await db.flush()
    await db.refresh(recipe)
    return recipe


async def update(db: AsyncSession, recipe: Recipe, updates: dict[str, Any]) -> Recipe:
    safe_fields = {k: v for k, v in updates.items() if k in _UPDATABLE_COLUMNS}
    for key, value in safe_fields.items():
        setattr(recipe, key, value)
    await db.flush()
    await db.refresh(recipe)
    return recipe


async def soft_delete(db: AsyncSession, recipe: Recipe) -> None:
    """Mark a recipe deleted (reversible). Versions/cooks are retained."""
    recipe.deleted_at = datetime.now(timezone.utc)
    await db.flush()
