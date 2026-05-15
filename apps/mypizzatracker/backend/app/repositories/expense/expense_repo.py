"""Expense repository -- CRUD over the ``pizza_expense`` table.

Thin: takes AsyncSession + primitive args and returns ORM rows. Business
rules (closed-drop guard, FK validation) live in the service layer.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.expense.expense import Expense


async def create_expense(db: AsyncSession, drop_id: uuid.UUID, data: dict) -> Expense:
    expense = Expense(drop_id=drop_id, **data)
    db.add(expense)
    await db.flush()
    return expense


async def get_expense(db: AsyncSession, expense_id: uuid.UUID) -> Optional[Expense]:
    stmt = select(Expense).where(Expense.id == expense_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_expenses_for_drop(
    db: AsyncSession, drop_id: uuid.UUID,
) -> list[Expense]:
    """Newest-first ordering -- matches the operator's mental model of
    'last thing I entered' floating to the top."""
    stmt = (
        select(Expense)
        .where(Expense.drop_id == drop_id)
        .order_by(Expense.created_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def update_expense(db: AsyncSession, expense: Expense, patch: dict) -> Expense:
    for key, value in patch.items():
        setattr(expense, key, value)
    await db.flush()
    return expense


async def delete_expense(db: AsyncSession, expense: Expense) -> None:
    await db.delete(expense)
    await db.flush()


async def sum_expenses_for_drop(db: AsyncSession, drop_id: uuid.UUID) -> Decimal:
    """Total amount across all expenses for a drop. Returns 0 for an
    empty set (rather than None) so callers can do arithmetic without
    branching."""
    stmt = select(func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.drop_id == drop_id,
    )
    return Decimal((await db.execute(stmt)).scalar_one())
