import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.core.rate_limit import RateLimiter
from app.schemas.dates.client_local_date import ClientLocalDate
from app.schemas.analytics.rental_roi_response import RentalRoiResponse
from app.schemas.analytics.utility_trends import UtilityTrendsResponse
from app.services.analytics import rental_roi_service, utility_trends_service

router = APIRouter(prefix="/analytics", tags=["analytics"])

_MAX_PROPERTY_IDS = 20
_analytics_limiter = RateLimiter(max_attempts=60, window_seconds=3600)
_DEFAULT_TARGET_RETURN_PCT = Decimal("8")


@router.get("/utility-trends", response_model=UtilityTrendsResponse)
async def get_utility_trends(
    start_date: date | None = None,
    end_date: date | None = None,
    property_ids: str | None = Query(None, description="Comma-separated property UUIDs"),
    granularity: str = Query("monthly", pattern="^(monthly|quarterly)$"),
    ctx: RequestContext = Depends(current_org_member),
) -> UtilityTrendsResponse:
    _analytics_limiter.check(f"analytics:{ctx.user_id}")

    parsed_property_ids: list[uuid.UUID] | None = None
    if property_ids:
        try:
            parsed_property_ids = [uuid.UUID(pid.strip()) for pid in property_ids.split(",") if pid.strip()]
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid property_id format")
        if len(parsed_property_ids) > _MAX_PROPERTY_IDS:
            raise HTTPException(status_code=422, detail=f"Too many property IDs (max {_MAX_PROPERTY_IDS})")

    return await utility_trends_service.get_utility_trends(
        ctx,
        start_date=start_date,
        end_date=end_date,
        property_ids=parsed_property_ids,
        granularity=granularity,
    )


@router.get("/rental-roi", response_model=RentalRoiResponse)
async def get_rental_roi(
    target_return_pct: Decimal = Query(_DEFAULT_TARGET_RETURN_PCT, ge=0, le=100),
    today: ClientLocalDate | None = Query(
        None,
        description=(
            "The caller's local date; the 12-month window and which loans are "
            "still active are measured from it. Defaults to the server's date."
        ),
    ),
    ctx: RequestContext = Depends(current_org_member),
) -> RentalRoiResponse:
    _analytics_limiter.check(f"analytics:{ctx.user_id}")
    return await rental_roi_service.get_rental_roi(ctx, target_return_pct=target_return_pct, today=today)
