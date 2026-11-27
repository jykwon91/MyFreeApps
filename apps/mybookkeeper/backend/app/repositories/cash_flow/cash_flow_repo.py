"""Money in and out per calendar month, summed in SQL."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions.transaction import Transaction
from app.repositories.cash_flow.cash_basis import cash_basis_filters
from app.repositories.transactions.counted_filters import counted_transaction_filters

MonthTotal = tuple[int, int, str, Decimal]


async def totals_by_month(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    start: _dt.date,
    end: _dt.date,
    transaction_scope: str | None,
    account_id: uuid.UUID | None,
    bank_history_start: _dt.date | None,
) -> list[MonthTotal]:
    """(year, month, income/expense, total) for counted rows dated
    ``start``..``end`` inclusive, on a cash basis (``cash_basis``).
    ``transaction_scope`` / ``account_id`` None leaves every scope / account
    in. Transfers are never in it."""
    year = extract("year", Transaction.transaction_date)
    month = extract("month", Transaction.transaction_date)
    stmt = (
        select(year, month, Transaction.transaction_type, func.sum(Transaction.amount))
        .where(
            *counted_transaction_filters(organization_id),
            *cash_basis_filters(bank_history_start),
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
        )
        .group_by(year, month, Transaction.transaction_type)
    )
    if transaction_scope is not None:
        stmt = stmt.where(Transaction.transaction_scope == transaction_scope)
    if account_id is not None:
        stmt = stmt.where(Transaction.account_id == account_id)
    result = await db.execute(stmt)
    return [(int(y), int(m), kind, Decimal(str(total))) for y, m, kind, total in result.all()]
