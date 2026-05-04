"""Routes for rent-payment attribution and the per-property P&L dashboard."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.transactions.attribution import (
    AttributeManuallyRequest,
    AttributionReviewQueueResponse,
    AttributionReviewItemRead,
    ConfirmReviewRequest,
    PropertyPnLResponse,
)
from app.services.transactions import attribution_service, property_pnl_service

router = APIRouter(tags=["attribution"])


# ---------------------------------------------------------------------------
# Attribution review queue
# ---------------------------------------------------------------------------

@router.get(
    "/transactions/attribution-review-queue",
    response_model=AttributionReviewQueueResponse,
)
async def list_attribution_review_queue(
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> AttributionReviewQueueResponse:
    items = await attribution_service.list_review_queue(
        organization_id=ctx.organization_id,
        limit=limit,
        offset=offset,
    )
    pending_count = await attribution_service.count_pending_reviews(ctx.organization_id)
    return AttributionReviewQueueResponse(
        items=[AttributionReviewItemRead.model_validate(item) for item in items],
        total=len(items),
        pending_count=pending_count,
    )


@router.post(
    "/transactions/attribution-review-queue/{review_id}/confirm",
)
async def confirm_attribution_review(
    review_id: uuid.UUID,
    body: ConfirmReviewRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> dict:
    try:
        return await attribution_service.confirm_review(
            review_id=review_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=body.applicant_id,
        )
    except ValueError as e:
        detail = str(e)
        if "not found" in detail:
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=422, detail=detail)


@router.post(
    "/transactions/attribution-review-queue/{review_id}/reject",
)
async def reject_attribution_review(
    review_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> dict:
    try:
        return await attribution_service.reject_review(
            review_id=review_id,
            organization_id=ctx.organization_id,
        )
    except ValueError as e:
        detail = str(e)
        if "not found" in detail:
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=422, detail=detail)


@router.post(
    "/transactions/{transaction_id}/attribute",
)
async def attribute_transaction_manually(
    transaction_id: uuid.UUID,
    body: AttributeManuallyRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> dict:
    try:
        return await attribution_service.attribute_manually(
            transaction_id=transaction_id,
            applicant_id=body.applicant_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
        )
    except ValueError as e:
        detail = str(e)
        if "not found" in detail:
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=422, detail=detail)


# ---------------------------------------------------------------------------
# Per-property P&L dashboard
# ---------------------------------------------------------------------------

@router.get(
    "/dashboard/property-pnl",
    response_model=PropertyPnLResponse,
)
async def property_pnl(
    since: date = Query(..., description="Start date (inclusive)"),
    until: date = Query(..., description="End date (inclusive)"),
    ctx: RequestContext = Depends(current_org_member),
) -> PropertyPnLResponse:
    if since > until:
        raise HTTPException(status_code=422, detail="'since' must be before or equal to 'until'")
    return await property_pnl_service.get_property_pnl(ctx, since=since, until=until)
