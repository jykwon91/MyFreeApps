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

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.recipe_list_constants import DEFAULT_RECIPE_PAGE_SIZE
from app.models.recipe.recipe import Recipe

# Columns a PATCH may touch. Tenant + server-managed columns are excluded
# (defense in depth on top of the schema's extra='forbid').
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({"title", "description", "source"})


async def list_all_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Recipe]:
    """Every non-deleted recipe the user owns, oldest first (data export)."""
    result = await db.execute(
        select(Recipe)
        .where(Recipe.user_id == user_id, Recipe.deleted_at.is_(None))
        .order_by(Recipe.created_at.asc(), Recipe.id.asc())
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> Recipe | None:
    """Return the recipe iff it belongs to ``user_id`` and is not soft-deleted.

    ``for_update`` locks the row until commit, so concurrent version writes for
    one recipe run one at a time instead of racing on the next version number.
    """
    stmt = select(Recipe).where(
        Recipe.id == recipe_id,
        Recipe.user_id == user_id,
        Recipe.deleted_at.is_(None),
    )
    if for_update:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def _library_conditions(search: str | None) -> list[ColumnElement[bool]]:
    """Not deleted, and the optional title search: the filters every list page and its count share."""
    conditions: list[ColumnElement[bool]] = [Recipe.deleted_at.is_(None)]
    if search is not None and search.strip():
        conditions.append(Recipe.title.ilike(f"%{search.strip()}%"))
    return conditions


def _owned_conditions(user_id: uuid.UUID, search: str | None) -> list[ColumnElement[bool]]:
    return [Recipe.user_id == user_id, *_library_conditions(search)]


async def _list_page(
    db: AsyncSession, conditions: list[ColumnElement[bool]], *, limit: int, offset: int,
) -> list[Recipe]:
    # ``id`` breaks ``updated_at`` ties so OFFSET / LIMIT pages never repeat or skip a row.
    stmt = (
        select(Recipe)
        .where(*conditions)
        .order_by(Recipe.updated_at.desc(), Recipe.id.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _count(db: AsyncSession, conditions: list[ColumnElement[bool]]) -> int:
    result = await db.execute(select(func.count()).select_from(Recipe).where(*conditions))
    return int(result.scalar_one())


async def list_by_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    search: str | None = None,
    limit: int = DEFAULT_RECIPE_PAGE_SIZE,
    offset: int = 0,
) -> list[Recipe]:
    """One page of a user's non-deleted recipes, most-recently-updated first.

    Tenant-scoped: always filters by ``user_id``. Backs the authenticated
    ``owner=me`` view on the public list route. Optional ``search``:
    case-insensitive substring on ``title``. ``count_by_user`` with the same
    filters gives the total across pages.
    """
    return await _list_page(db, _owned_conditions(user_id, search), limit=limit, offset=offset)


async def count_by_user(
    db: AsyncSession, user_id: uuid.UUID, *, search: str | None = None,
) -> int:
    """How many rows ``list_by_user`` matches across all pages."""
    return await _count(db, _owned_conditions(user_id, search))


async def list_public(
    db: AsyncSession,
    *,
    search: str | None = None,
    limit: int = DEFAULT_RECIPE_PAGE_SIZE,
    offset: int = 0,
) -> list[Recipe]:
    """One page of every non-deleted recipe, most-recently-updated first.

    Public read: deliberately NOT tenant-scoped — anyone may browse the
    recipe library. Dedicated function (never a ``user_id=None`` overload of
    :func:`list_by_user`) so a tenant-scoped write path can never accidentally
    fall through to an unscoped query.

    Optional ``search``: case-insensitive substring on ``title`` (bind param).
    """
    return await _list_page(db, _library_conditions(search), limit=limit, offset=offset)


async def count_public(db: AsyncSession, *, search: str | None = None) -> int:
    """How many rows ``list_public`` matches across all pages."""
    return await _count(db, _library_conditions(search))


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
