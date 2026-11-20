"""Expense CRUD with closed-drop guard.

The drop is the unit of read/write authority: a closed drop's financial
history is frozen, so expense create / update / delete are all rejected
once ``drop.status == "closed"``. Mirrors the service_dashboard pattern
where transitions are rejected against closed drops. Each mutation owns its
transaction through ``unit_of_work``.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.drop.drop import Drop
from app.models.expense.expense import Expense
from app.repositories.drop import drop_repo
from app.repositories.expense import expense_repo


class ExpenseServiceError(Exception):
    http_status: int = 400


class ExpenseNotFoundError(ExpenseServiceError):
    http_status = 404


class DropNotFoundError(ExpenseServiceError):
    http_status = 404


class DropClosedForExpenseError(ExpenseServiceError):
    http_status = 409


async def create_expense(drop_id: uuid.UUID, data: dict) -> Expense:
    async with unit_of_work() as db:
        drop = await _get_drop(db, drop_id)
        _ensure_drop_open(drop)
        return await expense_repo.create_expense(db, drop_id, data)


async def update_expense(expense_id: uuid.UUID, patch: dict) -> Expense:
    async with unit_of_work() as db:
        expense = await _get_open_expense(db, expense_id)
        return await expense_repo.update_expense(db, expense, patch)


async def delete_expense(expense_id: uuid.UUID) -> None:
    async with unit_of_work() as db:
        expense = await _get_open_expense(db, expense_id)
        await expense_repo.delete_expense(db, expense)


async def _get_open_expense(db: AsyncSession, expense_id: uuid.UUID) -> Expense:
    expense = await _get_expense(db, expense_id)
    drop = await _get_drop(db, expense.drop_id)
    _ensure_drop_open(drop)
    return expense


async def list_expenses(db: AsyncSession, drop_id: uuid.UUID) -> list[Expense]:
    # Read does not check drop.status -- closed drops can still be read.
    await _get_drop(db, drop_id)
    return await expense_repo.list_expenses_for_drop(db, drop_id)


async def _get_drop(db: AsyncSession, drop_id: uuid.UUID) -> Drop:
    drop = await drop_repo.get_drop(db, drop_id)
    if drop is None:
        raise DropNotFoundError(f"Drop {drop_id} not found")
    return drop


async def _get_expense(db: AsyncSession, expense_id: uuid.UUID) -> Expense:
    expense = await expense_repo.get_expense(db, expense_id)
    if expense is None:
        raise ExpenseNotFoundError(f"Expense {expense_id} not found")
    return expense


def _ensure_drop_open(drop: Drop) -> None:
    if drop.status == "closed":
        raise DropClosedForExpenseError(
            "Drop is closed; expenses are read-only.",
        )
