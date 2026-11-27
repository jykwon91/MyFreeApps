"""The payments in that count as income — one list for Cash flow and the
personal finances page, so both add up the same money in."""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.cash_flow import cash_flow_repo
from app.repositories.cash_flow.income_row import IncomeRow
from app.repositories.user import user_repo
from app.services.cash_flow import income_rules


async def counted_income(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    start: _dt.date,
    end: _dt.date,
    bank_history_start: _dt.date | None,
    transaction_scope: str | None = None,
    account_id: uuid.UUID | None = None,
) -> list[IncomeRow]:
    """Rows dated ``start``..``end`` that count as income, oldest first.
    ``transaction_scope`` / ``account_id`` None is every scope / account."""
    rows = await cash_flow_repo.list_income(
        db,
        organization_id=organization_id,
        start=start,
        end=end,
        bank_history_start=bank_history_start,
        transaction_scope=transaction_scope,
        account_id=account_id,
    )
    holder_names = await user_repo.holder_names(
        db, user_ids={row.account_user_id for row in rows if row.account_user_id is not None},
    )
    return [row for row in rows if not income_rules.is_from_self(row, holder_names)]
