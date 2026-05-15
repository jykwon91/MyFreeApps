"""Customer-facing (public) routes -- no authentication.

These are the only routes the pizza app exposes without a JWT. Customers
hit them anonymously to browse the menu, pick a slot, place an order, and
check on their order's status.

Routes are registered without the ``/api`` prefix -- docker Caddy strips
``/api`` before forwarding to the backend (see drops.py / menu.py for the
same pattern + reasoning).

Endpoints (production URLs prepend ``/api``):
  GET    /public/menu                     -- active pizzas + toppings
  GET    /public/drops/current            -- current active drop + slots w/ remaining capacity
  POST   /public/orders                   -- place an order; returns confirmation
  GET    /public/orders/{order_id}        -- look up an existing order (status check)
  GET    /public/customers/lookup         -- "welcome back" + "the usual" by phone
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.repositories.order import order_repo
from app.schemas.public.public_schemas import (
    PublicCustomerLookup,
    PublicDropRead,
    PublicMenuRead,
    PublicOrderConfirmation,
    PublicOrderCreate,
)
from app.schemas.customer.customer_schemas import CustomerCreate
from app.services.order import order_service
from app.services.order.order_service import OrderServiceError
from app.services.public import public_service

router = APIRouter(prefix="/public", tags=["public"])


def _service_error(exc: OrderServiceError) -> HTTPException:
    return HTTPException(status_code=exc.http_status, detail=str(exc))


@router.get("/menu", response_model=PublicMenuRead)
async def get_public_menu(
    db: AsyncSession = Depends(get_db),
) -> PublicMenuRead:
    return await public_service.build_public_menu(db)


@router.get("/drops/current", response_model=PublicDropRead)
async def get_current_drop(
    db: AsyncSession = Depends(get_db),
) -> PublicDropRead:
    payload = await public_service.build_current_drop(db)
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="No drop is currently accepting orders. Check back soon!",
        )
    return payload


@router.post(
    "/orders",
    response_model=PublicOrderConfirmation,
    status_code=201,
)
async def place_public_order(
    body: PublicOrderCreate,
    db: AsyncSession = Depends(get_db),
) -> PublicOrderConfirmation:
    try:
        order = await order_service.place_order(
            db,
            drop_id=body.drop_id,
            slot_id=body.slot_id,
            customer=CustomerCreate(
                name=body.customer_name,
                phone=body.customer_phone,
            ),
            payment_method_tag=body.payment_method_tag,
            pizza_lines=[
                {
                    "pizza_type_id": p.pizza_type_id,
                    "topping_type_ids": list(p.topping_type_ids),
                    "modifications_text": p.modifications_text,
                }
                for p in body.pizzas
            ],
        )
    except OrderServiceError as exc:
        raise _service_error(exc) from exc

    return await public_service.build_order_confirmation(db, order)


@router.get("/customers/lookup", response_model=PublicCustomerLookup)
async def lookup_public_customer(
    phone: str = Query(..., min_length=1, max_length=30),
    db: AsyncSession = Depends(get_db),
) -> PublicCustomerLookup:
    """Phone-keyed "welcome back" lookup for the public order page.

    The customer's phone is the only secret here; the response only
    includes the name they typed in last time plus the pizza-line shape
    of their most recent non-no-show order (no IDs they couldn't already
    see in the public menu, no PII beyond their own first name).

    404 when no customer matches -- the frontend swallows it silently so
    the lookup is a no-op for first-time orderers.
    """
    payload = await public_service.build_customer_lookup(db, phone)
    if payload is None:
        raise HTTPException(status_code=404, detail="No customer with that phone.")
    return payload


@router.get("/orders/{order_id}", response_model=PublicOrderConfirmation)
async def get_public_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> PublicOrderConfirmation:
    """Look up an order by its UUID.

    The order ID is the only secret; anyone holding it can read the order.
    That mirrors the existing model -- the customer is handed it inline at
    placement time and can revisit it to check status. There is no rate
    limit on this endpoint by design: customers may reload the page while
    waiting for pickup, and bots that guess UUIDs find nothing useful even
    if they hit (only the customer's name + phone, which is what the
    customer just typed in publicly anyway).
    """
    order = await order_repo.get_order(db, order_id)
    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found. Double-check the order link from your confirmation.",
        )
    return await public_service.build_order_confirmation(db, order)
