"""Repository for ``spending_budgets``. Scoped to the organization."""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budgets.spending_budget import SpendingBudget


async def _find(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    spending_category_id: uuid.UUID,
    effective_month: _dt.date,
) -> SpendingBudget | None:
    result = await db.execute(
        select(SpendingBudget).where(
            SpendingBudget.organization_id == organization_id,
            SpendingBudget.spending_category_id == spending_category_id,
            SpendingBudget.effective_month == effective_month,
        )
    )
    return result.scalar_one_or_none()


async def upsert(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    spending_category_id: uuid.UUID,
    effective_month: _dt.date,
    amount_cents: int | None,
) -> SpendingBudget:
    """Set the category's budget from ``effective_month`` on. A second write
    for the same month updates that month's row; later months' rows stay."""
    key = {
        "organization_id": organization_id,
        "spending_category_id": spending_category_id,
        "effective_month": effective_month,
    }
    existing = await _find(db, **key)
    if existing is None:
        budget = SpendingBudget(amount_cents=amount_cents, **key)
        try:
            async with db.begin_nested():
                db.add(budget)
            return budget
        except IntegrityError:
            existing = await _find(db, **key)
            if existing is None:
                raise
    existing.amount_cents = amount_cents
    await db.flush()
    return existing


async def list_through(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    month: _dt.date,
) -> list[SpendingBudget]:
    """Every budget row that started on or before ``month``, oldest first, so
    the last one per category is the budget in effect that month."""
    result = await db.execute(
        select(SpendingBudget)
        .where(
            SpendingBudget.organization_id == organization_id,
            SpendingBudget.effective_month <= month,
        )
        .order_by(SpendingBudget.effective_month)
    )
    return list(result.scalars().all())
