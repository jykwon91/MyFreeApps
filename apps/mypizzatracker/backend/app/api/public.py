"""Customer-facing (public) routes -- no authentication.

These are the only routes the pizza app exposes without a JWT. Customers
hit them anonymously to browse the menu, pick a slot, and place an order.

Routes are registered without the ``/api`` prefix -- docker Caddy strips
``/api`` before forwarding to the backend (see drops.py / menu.py for the
same pattern + reasoning).

Endpoints (production URLs prepend ``/api``):
  GET    /public/menu                     -- active pizzas + toppings
  GET    /public/drops/current            -- current active drop + slots w/ remaining capacity
  POST   /public/orders                   -- place an order; returns confirmation

The order status check endpoint (GET /public/orders/{id}) lands in PR 6.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.public.public_schemas import (
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
