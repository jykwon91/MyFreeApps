"""Pydantic schemas for the operator-facing service dashboard.

The dashboard payload denormalizes pizza/topping names so the frontend can
render order cards without an N+1 lookup. Pure read shapes -- mutations go
through ``AdvanceOrderRequest`` / ``MoveOrderRequest``.
"""
from __future__ import annotations

import uuid
from datetime import date as _date, datetime, time as _time
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.order.order_schemas import OrderRead


class DashboardCustomer(BaseModel):
    id: uuid.UUID
    name: str
    phone: str

    model_config = {"from_attributes": True}


class DashboardOrderPizzaTopping(BaseModel):
    topping_type_id: uuid.UUID
    name: str
    price_delta_snapshot: Decimal


class DashboardOrderPizza(BaseModel):
    id: uuid.UUID
    pizza_type_id: uuid.UUID
    name: str
    modifications_text: Optional[str] = None
    is_free: bool
    price_snapshot: Decimal
    toppings: list[DashboardOrderPizzaTopping] = Field(default_factory=list)


class DashboardOrder(BaseModel):
    id: uuid.UUID
    slot_id: uuid.UUID
    status: str
    payment_method_tag: str
    payment_status: str
    ready_text_sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    customer: DashboardCustomer
    pizzas: list[DashboardOrderPizza] = Field(default_factory=list)
    total: Decimal
    pizza_count: int


class DashboardSlot(BaseModel):
    id: uuid.UUID
    pickup_time: _time
    max_pizzas: int
    pizza_count: int
    remaining_capacity: int
    orders: list[DashboardOrder] = Field(default_factory=list)


class DashboardDrop(BaseModel):
    id: uuid.UUID
    name: str
    date: _date
    status: str
    slot_window_start: _time
    slot_window_end: _time
    in_progress_count: int


class ServiceDashboard(BaseModel):
    """Top-level payload returned by ``GET /service/drops/{drop_id}``."""

    drop: DashboardDrop
    slots: list[DashboardSlot] = Field(default_factory=list)
    server_time: datetime


# ---------------------------------------------------------------------------
# Mutation request schemas
# ---------------------------------------------------------------------------

class AdvanceOrderRequest(BaseModel):
    target_status: str


class MoveOrderRequest(BaseModel):
    slot_id: uuid.UUID


# ---------------------------------------------------------------------------
# Mutation response schemas
# ---------------------------------------------------------------------------

class AdvanceOrderResponse(BaseModel):
    """Response for ``POST /service/orders/{order_id}/advance``.

    ``sms_dispatched`` is non-null only when the transition targeted
    ``ready_text_sent``:

    - ``True`` -- SMS sent successfully via Twilio (or console-logged in dev).
    - ``False`` -- Twilio rejected the send or creds were missing;
      ``sms_error`` carries the operator-facing reason so the dashboard
      can prompt them to text the customer manually.
    - ``None`` -- this transition didn't involve SMS.
    """

    order: OrderRead
    sms_dispatched: Optional[bool] = None
    sms_error: Optional[str] = None
