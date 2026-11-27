"""Money in per calendar month, summed in SQL. (Money out is what
``spending_ledger`` counts as spent.)"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.financial_account_enums import ACCOUNT_TYPE_CREDIT_CARD
from app.core.plaid_category_constants import PFC_TRANSFER_PRIMARIES
from app.core.tags import TRANSACTION_TYPE_INCOME
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.transactions.transaction import Transaction
from app.repositories.cash_flow.cash_basis import cash_basis_filters
from app.repositories.transactions.counted_filters import counted_transaction_filters

MonthIncome = tuple[int, int, Decimal]


async def income_by_month(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    start: _dt.date,
    end: _dt.date,
    transaction_scope: str | None,
    account_id: uuid.UUID | None,
    bank_history_start: _dt.date | None,
) -> list[MonthIncome]:
    """(year, month, total) of counted income dated ``start``..``end``
    inclusive, on a cash basis (``cash_basis``). ``transaction_scope`` /
    ``account_id`` None leaves every scope / account in. Transfers are never
    in it, and neither is a payment arriving on a credit card (one the bank
    calls a transfer or loan payment): that is paying the card off, not
    income. A refund on a card is still money in."""
    year = extract("year", Transaction.transaction_date)
    month = extract("month", Transaction.transaction_date)
    stmt = (
        select(year, month, func.sum(Transaction.amount))
        .outerjoin(FinancialAccount, FinancialAccount.id == Transaction.account_id)
        .where(
            *counted_transaction_filters(organization_id),
            *cash_basis_filters(bank_history_start),
            Transaction.transaction_type == TRANSACTION_TYPE_INCOME,
            # Spelled out, not NOT(a AND b): either side can be NULL.
            or_(
                FinancialAccount.account_type.is_(None),
                FinancialAccount.account_type != ACCOUNT_TYPE_CREDIT_CARD,
                Transaction.external_category.is_(None),
                Transaction.external_category.not_in(list(PFC_TRANSFER_PRIMARIES)),
            ),
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
        )
        .group_by(year, month)
    )
    if transaction_scope is not None:
        stmt = stmt.where(Transaction.transaction_scope == transaction_scope)
    if account_id is not None:
        stmt = stmt.where(Transaction.account_id == account_id)
    result = await db.execute(stmt)
    return [(int(y), int(m), Decimal(str(total))) for y, m, total in result.all()]
