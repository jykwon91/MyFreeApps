"""Operator customer-DB routes.

  GET    /customers                            -- one page of customers with rollup stats
  PATCH  /customers/{customer_id}/notes        -- replace the operator notes field

Auth is enforced at the router level (single-user app). Paths register
without ``/api`` per the project's router-prefix convention.

The customer list is sorted by most-recent-order desc; the operator uses
it to find a customer by name or partial phone before/after a drop. Notes
are operator-only freeform text the customer never sees -- things like
"prefers extra crispy crust", "gluten sensitive", or "always shows up 20m
late".
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.schemas.customer.customer_list_response import CustomerListResponse
from app.schemas.customer.customer_schemas import (
    CustomerListItem,
    CustomerNotesUpdate,
    CustomerRead,
)
from app.services.customer import customer_service
from app.services.customer.customer_service import CustomerServiceError

router = APIRouter(
    prefix="/customers",
    tags=["customers"],
    dependencies=[Depends(current_active_user)],
)


def _service_error(exc: CustomerServiceError) -> HTTPException:
    return HTTPException(status_code=exc.http_status, detail=str(exc))


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    search: str | None = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> CustomerListResponse:
    rows, total = await customer_service.list_with_stats(
        db, search=search, limit=limit, offset=offset,
    )
    items = [
        CustomerListItem(
            id=row["customer"].id,
            name=row["customer"].name,
            phone=row["customer"].phone,
            notes=row["customer"].notes,
            order_count=row["order_count"],
            last_order_at=row["last_order_at"],
        )
        for row in rows
    ]
    return CustomerListResponse(
        items=items, total=total, has_more=offset + len(items) < total,
    )


@router.patch(
    "/{customer_id}/notes", response_model=CustomerRead,
)
async def update_customer_notes(
    customer_id: uuid.UUID,
    body: CustomerNotesUpdate,
    db: AsyncSession = Depends(get_db),
) -> CustomerRead:
    try:
        customer = await customer_service.update_notes(
            db, customer_id, body.notes,
        )
    except CustomerServiceError as exc:
        raise _service_error(exc) from exc
    return CustomerRead.model_validate(customer)
