"""Repository for ``spending_categories``.

Scoped to the organization — every member of a workspace shares the same
personal spending categories.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions.spending_category import SpendingCategory


async def create(db: AsyncSession, category: SpendingCategory) -> SpendingCategory:
    db.add(category)
    await db.flush()
    await db.refresh(category)
    return category


async def get(
    db: AsyncSession,
    *,
    category_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> SpendingCategory | None:
    stmt = select(SpendingCategory).where(
        SpendingCategory.id == category_id,
        SpendingCategory.organization_id == organization_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_for_org(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    include_archived: bool = False,
) -> list[SpendingCategory]:
    """All spending categories for an org, live first, alphabetical within."""
    stmt = select(SpendingCategory).where(
        SpendingCategory.organization_id == organization_id,
    )
    if not include_archived:
        stmt = stmt.where(SpendingCategory.archived_at.is_(None))
    stmt = stmt.order_by(
        SpendingCategory.archived_at.is_(None).desc(),  # live first
        SpendingCategory.name,
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_live(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
) -> int:
    """How many live (non-archived) categories this org has."""
    result = await db.execute(
        select(SpendingCategory).where(
            SpendingCategory.organization_id == organization_id,
            SpendingCategory.archived_at.is_(None),
        )
    )
    return len(result.scalars().all())


async def name_exists(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    name: str,
    exclude_id: uuid.UUID | None = None,
) -> bool:
    """True if a live category with this name already exists in the org."""
    stmt = select(SpendingCategory).where(
        SpendingCategory.organization_id == organization_id,
        SpendingCategory.name == name,
        SpendingCategory.archived_at.is_(None),
    )
    if exclude_id is not None:
        stmt = stmt.where(SpendingCategory.id != exclude_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None
