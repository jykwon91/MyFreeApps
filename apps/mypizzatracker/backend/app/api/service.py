"""Operator service-dashboard routes.

  GET   /service/drops/{drop_id}                  -- enriched dashboard payload
  POST  /service/orders/{order_id}/advance        -- transition order status
  POST  /service/orders/{order_id}/move           -- change slot

Auth is enforced at the router level (single-user app).

Paths register without ``/api`` per the project's router-prefix convention;
docker Caddy strips ``/api`` and ``root_path="/api"`` on the FastAPI app
records the strip for URL generation.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.schemas.order.order_schemas import OrderRead
from app.schemas.service.service_schemas import (
    AdvanceOrderRequest,
    MoveOrderRequest,
    ServiceDashboard,
)
from app.services.service_dashboard import service_dashboard_service
from app.services.service_dashboard.service_dashboard_service import (
    DashboardServiceError,
)

router = APIRouter(
    prefix="/service",
    tags=["service"],
    dependencies=[Depends(current_active_user)],
)


def _service_error(exc: DashboardServiceError) -> HTTPException:
    return HTTPException(status_code=exc.http_status, detail=str(exc))


@router.get("/drops/{drop_id}", response_model=ServiceDashboard)
async def get_dashboard(
    drop_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ServiceDashboard:
    try:
        return await service_dashboard_service.get_dashboard(db, drop_id)
    except DashboardServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/orders/{order_id}/advance", response_model=OrderRead)
async def advance_order(
    order_id: uuid.UUID,
    body: AdvanceOrderRequest,
    db: AsyncSession = Depends(get_db),
) -> OrderRead:
    try:
        order = await service_dashboard_service.advance_order_status(
            db, order_id, body.target_status,
        )
    except DashboardServiceError as exc:
        raise _service_error(exc) from exc
    return OrderRead.model_validate(order)


@router.post("/orders/{order_id}/move", response_model=OrderRead)
async def move_order(
    order_id: uuid.UUID,
    body: MoveOrderRequest,
    db: AsyncSession = Depends(get_db),
) -> OrderRead:
    try:
        order = await service_dashboard_service.move_order_to_slot(
            db, order_id, body.slot_id,
        )
    except DashboardServiceError as exc:
        raise _service_error(exc) from exc
    return OrderRead.model_validate(order)
