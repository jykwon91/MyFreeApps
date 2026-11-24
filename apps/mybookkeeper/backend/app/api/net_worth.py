"""HTTP routes for the net worth page.

Route prefix: /net-worth.
"""
from __future__ import annotations

import datetime as _dt

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.net_worth_constants import DEFAULT_RANGE
from app.core.permissions import current_org_member
from app.schemas.net_worth.net_worth_history_response import NetWorthHistoryResponse
from app.schemas.net_worth.net_worth_response import NetWorthResponse
from app.services.net_worth import net_worth_service

router = APIRouter(prefix="/net-worth", tags=["net-worth"])


@router.get("", response_model=NetWorthResponse)
async def get_net_worth(
    ctx: RequestContext = Depends(current_org_member),
) -> NetWorthResponse:
    return await net_worth_service.get_net_worth(
        organization_id=ctx.organization_id, user_id=ctx.user_id, today=_dt.date.today(),
    )


@router.get("/history", response_model=NetWorthHistoryResponse)
async def get_net_worth_history(
    range_key: str = Query(DEFAULT_RANGE, alias="range"),
    ctx: RequestContext = Depends(current_org_member),
) -> NetWorthHistoryResponse:
    try:
        return await net_worth_service.get_history(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            range_key=range_key,
            today=_dt.date.today(),
        )
    except net_worth_service.InvalidNetWorthRangeError as exc:
        raise HTTPException(status_code=422, detail=f"Unknown range: {exc}") from exc
