"""Customer-facing wire shapes.

The owner-facing schemas under ``order_schemas``, ``menu_schemas``, etc. expose
audit fields (timestamps, payment status, internal status enum) that the
customer should not see. These slimmer Public* schemas surface only what a
guest customer needs to browse the menu, pick a slot, place an order, and
see the confirmation.

Pickup time is rendered as a string (``HH:MM``) because the customer-facing
UI doesn't care about timezone or seconds.
"""
from __future__ import annotations

import uuid
from datetime import date as _date, datetime, time as _time
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Menu
# ---------------------------------------------------------------------------

class PublicPizzaRead(BaseModel):
    id: uuid.UUID
    name: str
    price: Decimal
    description: Optional[str] = None


class PublicToppingRead(BaseModel):
    id: uuid.UUID
    name: str
    price_delta: Decimal


class PublicMenuRead(BaseModel):
    pizzas: list[PublicPizzaRead] = Field(default_factory=list)
    toppings: list[PublicToppingRead] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Current drop + slots
# ---------------------------------------------------------------------------

class PublicSlotRead(BaseModel):
    id: uuid.UUID
    pickup_time: _time
    max_pizzas: int
    remaining_pizzas: int


class PublicDropRead(BaseModel):
    id: uuid.UUID
    name: str
    date: _date
    slot_window_start: _time
    slot_window_end: _time
    slots: list[PublicSlotRead] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Order placement
# ---------------------------------------------------------------------------

class PublicOrderPizzaCreate(BaseModel):
    pizza_type_id: uuid.UUID
    topping_type_ids: list[uuid.UUID] = Field(default_factory=list)
    modifications_text: Optional[str] = Field(None, max_length=500)


class PublicOrderCreate(BaseModel):
    drop_id: uuid.UUID
    slot_id: uuid.UUID
    customer_name: str = Field(..., min_length=1, max_length=100)
    customer_phone: str = Field(..., min_length=1, max_length=20)
    payment_method_tag: str = Field(..., min_length=1, max_length=30)
    pizzas: list[PublicOrderPizzaCreate] = Field(..., min_length=1)


class PublicOrderPizzaConfirmation(BaseModel):
    pizza_name: str
    pizza_price: Decimal
    toppings: list[str] = Field(default_factory=list)
    toppings_price_delta_total: Decimal
    modifications_text: Optional[str] = None
    line_total: Decimal


class PublicOrderConfirmation(BaseModel):
    order_id: uuid.UUID
    drop_name: str
    drop_date: _date
    slot_pickup_time: _time
    customer_name: str
    customer_phone: str
    payment_method_tag: str
    payment_status: str
    status: str
    pizzas: list[PublicOrderPizzaConfirmation]
    total: Decimal
    created_at: datetime
