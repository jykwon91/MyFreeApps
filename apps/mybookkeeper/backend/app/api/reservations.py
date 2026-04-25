import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.transactions.reservation import OccupancyResponse, ReservationRead
from app.services.transactions import reservation_query_service

router = APIRouter(prefix="/reservations", tags=["reservations"])


@router.get("", response_model=list[ReservationRead])
async def list_reservations(
    property_id: Optional[uuid.UUID] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = Query(default=1000, le=5000),
    offset: int = 0,
    ctx: RequestContext = Depends(current_org_member),
) -> list[ReservationRead]:
    return await reservation_query_service.list_reservations(
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
    return await reservation_query_service.get_occupancy(
        ctx, property_id, start_date, end_date,
    )
