"""Cash flow: money in vs out per month over a range, on a cash basis.

Orchestration only — money in is ``cash_flow_repo``, money out is what
``spending_ledger`` counts as spent (the same rows Monthly expenses adds up),
which rows count is ``cash_basis``, the per-month sums ``cash_flow_months``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.budget_constants import BUDGET_CURRENCY, CASH_FLOW_SCOPES, RANGE_MONTHS, SCOPE_ALL
from app.core.month_text import month_end
from app.db.session import unit_of_work
from app.repositories.cash_flow import cash_basis, cash_flow_repo
from app.schemas.cash_flow.cash_flow_response import CashFlowResponse
from app.services.cash_flow import cash_flow_months
from app.services.monthly_expenses import spending_ledger


class InvalidCashFlowRangeError(ValueError):
    pass


class InvalidCashFlowScopeError(ValueError):
    pass


async def get_cash_flow(
    *,
    organization_id: uuid.UUID,
    range_key: str,
    scope: str,
    account_id: uuid.UUID | None,
    today: _dt.date,
) -> CashFlowResponse:
    if range_key not in RANGE_MONTHS:
        raise InvalidCashFlowRangeError(range_key)
    if scope not in CASH_FLOW_SCOPES:
        raise InvalidCashFlowScopeError(scope)
    months = cash_flow_months.range_months(range_key, today)
    async with unit_of_work() as db:
        history_start = await cash_basis.bank_history_start(db, organization_id=organization_id)
        transaction_scope = None if scope == SCOPE_ALL else scope
        income = await cash_flow_repo.income_by_month(
            db,
            organization_id=organization_id,
            start=months[0],
            end=month_end(months[-1]),
            transaction_scope=transaction_scope,
            account_id=account_id,
            bank_history_start=history_start,
        )
        spending = await spending_ledger.counted_spending(
            db,
            organization_id=organization_id,
            first_day=months[0],
            last_day=month_end(months[-1]),
            transaction_scope=transaction_scope,
            bank_history_start=history_start,
            account_id=account_id,
            approved_only=True,
        )
    rows, sums = cash_flow_months.build_months(months, income, spending)
    return CashFlowResponse(
        range=range_key,
        scope=scope,
        account_id=account_id,
        currency=BUDGET_CURRENCY,
        bank_history_start=history_start,
        months=rows,
        totals=sums,
    )
