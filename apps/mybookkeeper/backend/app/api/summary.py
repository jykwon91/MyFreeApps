import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.transactions.summary import SummaryResponse, TaxSummaryResponse
from app.services.transactions import summary_service

router = APIRouter(prefix="/summary", tags=["summary"])


@router.get("", response_model=SummaryResponse)
async def get_summary(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    property_ids: list[uuid.UUID] | None = Query(default=None),
    ctx: RequestContext = Depends(current_org_member),
) -> SummaryResponse:
    return await summary_service.get_summary(
        ctx, start_date=start_date, end_date=end_date, property_ids=property_ids,
    )


@router.get("/tax", response_model=TaxSummaryResponse)
async def get_tax_summary(
    year: int = Query(...),
    ctx: RequestContext = Depends(current_org_member),
) -> TaxSummaryResponse:
    return await summary_service.get_tax_summary(ctx, year)
