"""HTTP route for the Texas dwelling rate watch.

Route prefix: /insurance-market.

Its own resource rather than a path under ``/insurance-policies``: the response
is as much about the market as about the operator's policies, and it reaches
outside the database to the Texas Department of Insurance. Keeping it separate
means the policy list never inherits a third party's latency.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.insurance.insurance_market_watch_response import (
    InsuranceMarketWatchResponse,
)
from app.services.insurance import insurance_market_watch_service

router = APIRouter(prefix="/insurance-market", tags=["insurance-market"])


@router.get("/rate-watch", response_model=InsuranceMarketWatchResponse)
async def get_rate_watch(
    ctx: RequestContext = Depends(current_org_member),
) -> InsuranceMarketWatchResponse:
    """What Texas carriers have filed that bears on the operator's renewals.

    A read, so org membership is enough — nothing here writes. The TDI feed is
    public data about companies, not about the operator, so no part of their
    portfolio leaves the server to fetch it.
    """
    return await insurance_market_watch_service.get_market_watch(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
    )
