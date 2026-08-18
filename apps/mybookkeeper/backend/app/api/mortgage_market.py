"""HTTP route for the mortgage rate check.

Route prefix: /mortgage-market.

Its own resource rather than a path under ``/mortgages``, mirroring
``insurance_market``: the response is as much about the market as about the
operator's loans, and it reaches outside the database to FRED. Keeping it
separate means the loan list never inherits a third party's latency.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.mortgage.mortgage_rate_watch_response import (
    MortgageRateWatchResponse,
)
from app.services.mortgage import mortgage_rate_watch_service

router = APIRouter(prefix="/mortgage-market", tags=["mortgage-market"])


@router.get("/rate-watch", response_model=MortgageRateWatchResponse)
async def get_rate_watch(
    ctx: RequestContext = Depends(current_org_member),
) -> MortgageRateWatchResponse:
    """Where each recorded loan sits against this week's published averages.

    A read, so org membership is enough — nothing here writes. Freddie Mac's
    survey is public data about the national market, not about the operator, so
    no part of their portfolio leaves the server to fetch it.
    """
    return await mortgage_rate_watch_service.get_rate_watch(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
    )
