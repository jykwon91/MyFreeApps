import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.transactions.booking_statement import BookingStatementRead, OccupancyResponse
from app.services.transactions import booking_statement_query_service

router = APIRouter(prefix="/booking-statements", tags=["booking-statements"])


@router.get("", response_model=list[BookingStatementRead])
async def list_booking_statements(
    property_id: Optional[uuid.UUID] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = Query(default=1000, le=5000),
    offset: int = 0,
    ctx: RequestContext = Depends(current_org_member),
) -> list[BookingStatementRead]:
    return await booking_statement_query_service.list_booking_statements(
        ctx,
        property_id=property_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )


@router.get("/occupancy", response_model=OccupancyResponse)
async def occupancy_stats(
    property_id: uuid.UUID = Query(...),
    start_date: date = Query(...),
    end_date: date = Query(...),
    ctx: RequestContext = Depends(current_org_member),
) -> OccupancyResponse:
    if end_date <= start_date:
        raise HTTPException(status_code=422, detail="end_date must be after start_date")
    return await booking_statement_query_service.get_occupancy(
        ctx, property_id, start_date, end_date,
    )
