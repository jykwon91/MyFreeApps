"""Personal money per spending category over a date range, summed in SQL."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.spending_category_enums import TRANSACTION_SCOPE_PERSONAL
from app.models.transactions.transaction import Transaction
from app.repositories.transactions.counted_filters import counted_transaction_filters

CategoryTotal = tuple[uuid.UUID | None, str, Decimal]


async def totals_by_category(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    start: _dt.date,
    end: _dt.date,
) -> list[CategoryTotal]:
    """(spending category or None, income/expense, total) for counted personal
    rows dated ``start``..``end`` inclusive. Transfers are never in it."""
    result = await db.execute(
        select(
            Transaction.spending_category_id,
            Transaction.transaction_type,
            func.sum(Transaction.amount),
        )
        .where(
            *counted_transaction_filters(organization_id),
            Transaction.transaction_scope == TRANSACTION_SCOPE_PERSONAL,
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
        )
        .group_by(Transaction.spending_category_id, Transaction.transaction_type)
    )
    return [(category_id, kind, Decimal(str(total))) for category_id, kind, total in result.all()]
