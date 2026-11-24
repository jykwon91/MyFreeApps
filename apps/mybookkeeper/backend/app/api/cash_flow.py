"""HTTP routes for the cash flow page.

Route prefix: /cash-flow.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.budget_constants import DEFAULT_CASH_FLOW_RANGE, DEFAULT_CASH_FLOW_SCOPE
from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.cash_flow.cash_flow_response import CashFlowResponse
from app.services.cash_flow import cash_flow_service

router = APIRouter(prefix="/cash-flow", tags=["cash-flow"])


@router.get("", response_model=CashFlowResponse)
async def get_cash_flow(
    range_key: str = Query(DEFAULT_CASH_FLOW_RANGE, alias="range"),
    scope: str = Query(DEFAULT_CASH_FLOW_SCOPE),
    account_id: uuid.UUID | None = Query(None),
    ctx: RequestContext = Depends(current_org_member),
) -> CashFlowResponse:
    try:
        return await cash_flow_service.get_cash_flow(
            organization_id=ctx.organization_id,
            range_key=range_key,
            scope=scope,
            account_id=account_id,
            today=_dt.date.today(),
        )
    except cash_flow_service.InvalidCashFlowRangeError as exc:
        raise HTTPException(status_code=422, detail=f"Unknown range: {exc}") from exc
    except cash_flow_service.InvalidCashFlowScopeError as exc:
        raise HTTPException(status_code=422, detail=f"Unknown scope: {exc}") from exc
