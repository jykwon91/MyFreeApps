"""The spending the savings research summary is built from, read in SQL.

Only counted expense rows (``counted_transaction_filters``: approved, live,
never a transfer or a personal transfer). Nothing here returns a
description, a payer, an account number or a person: the label is a spending
category or bookkeeping category name, the merchant is the vendor name.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.spending_category_enums import TRANSACTION_SCOPE_PERSONAL
from app.core.tags import TRANSACTION_TYPE_EXPENSE
from app.models.transactions.spending_category import SpendingCategory
from app.models.transactions.transaction import Transaction
from app.repositories.transactions.counted_filters import counted_transaction_filters

# (scope, category label, total, charge count)
CategorySpendRow = tuple[str, str, Decimal, int]
# (merchant, date, amount)
MerchantChargeRow = tuple[str, _dt.date, Decimal]


def _expense_filters(organization_id: uuid.UUID, start: _dt.date, end: _dt.date) -> list:
    return [
        *counted_transaction_filters(organization_id),
        Transaction.transaction_type == TRANSACTION_TYPE_EXPENSE,
        Transaction.transaction_date >= start,
        Transaction.transaction_date <= end,
    ]


async def expense_totals_by_category(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    start: _dt.date,
    end: _dt.date,
) -> list[CategorySpendRow]:
    """Expense totals per (scope, category) for ``start``..``end`` inclusive.

    A personal row is labelled by its spending category (the budget's
    categories); a rental or business row by its bookkeeping category.
    """
    label = case(
        (
            Transaction.transaction_scope == TRANSACTION_SCOPE_PERSONAL,
            func.coalesce(SpendingCategory.name, Transaction.category),
        ),
        else_=Transaction.category,
    )
    result = await db.execute(
        select(
            Transaction.transaction_scope,
            label,
            func.sum(Transaction.amount),
            func.count(Transaction.id),
        )
        .outerjoin(SpendingCategory, SpendingCategory.id == Transaction.spending_category_id)
        .where(*_expense_filters(organization_id, start, end))
        .group_by(Transaction.transaction_scope, label)
    )
    return [
        (scope, name, Decimal(str(total)), int(count))
        for scope, name, total, count in result.all()
        if name
    ]


async def merchant_charges(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    start: _dt.date,
    end: _dt.date,
) -> list[MerchantChargeRow]:
    """Every counted expense with a vendor name in the window, oldest first.

    The recurring-charge detector groups these by merchant itself; the rows
    stay small (merchant, date, amount) so a year of spending is cheap to load.
    """
    merchant = func.coalesce(Transaction.normalized_vendor, Transaction.vendor)
    result = await db.execute(
        select(merchant, Transaction.transaction_date, Transaction.amount)
        .where(
            *_expense_filters(organization_id, start, end),
            merchant.is_not(None),
            # A charge tied to a person (a tenant, a named payer) names that
            # person, not a merchant: it never leaves MBK.
            Transaction.applicant_id.is_(None),
            Transaction.payer_name.is_(None),
        )
        .order_by(Transaction.transaction_date)
    )
    return [(name, day, Decimal(str(amount))) for name, day, amount in result.all() if name]
