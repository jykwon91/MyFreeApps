"""Cash flow: money in vs out per month over a range.

Orchestration only — the query is in ``cash_flow_repo``, the counting rules
in ``cash_flow_months``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.budget_constants import BUDGET_CURRENCY, CASH_FLOW_SCOPES, RANGE_MONTHS, SCOPE_ALL
from app.core.month_text import month_end
from app.db.session import unit_of_work
from app.repositories.cash_flow import cash_flow_repo
from app.schemas.cash_flow.cash_flow_response import CashFlowResponse
from app.services.cash_flow import cash_flow_months


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
        totals = await cash_flow_repo.totals_by_month(
            db,
            organization_id=organization_id,
            start=months[0],
            end=month_end(months[-1]),
            transaction_scope=None if scope == SCOPE_ALL else scope,
            account_id=account_id,
        )
    rows, sums = cash_flow_months.build_months(months, totals)
    return CashFlowResponse(
        range=range_key,
        scope=scope,
        account_id=account_id,
        currency=BUDGET_CURRENCY,
        months=rows,
        totals=sums,
    )
