"""Pydantic schemas for Order / OrderPizza / OrderPizzaTopping.

These are the internal canonical shapes. The customer-facing public endpoint
uses :mod:`app.schemas.public.public_schemas` for slimmer wire shapes; the
owner-facing service dashboard (PR 7) will read these directly.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

ORDER_STATUSES: tuple[str, ...] = (
    "not_started",
    "cooking",
    "ready_text_sent",
    "ready_waiting",
    "picked_up",
    "no_show",
)

PAYMENT_STATUSES: tuple[str, ...] = ("unpaid", "paid")


class OrderPizzaToppingRead(BaseModel):
    topping_type_id: uuid.UUID
    price_delta_snapshot: Decimal

    model_config = {"from_attributes": True}


class OrderPizzaRead(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    pizza_type_id: uuid.UUID
    modifications_text: Optional[str] = None
    is_free: bool
    price_snapshot: Decimal
    toppings: list[OrderPizzaToppingRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class OrderRead(BaseModel):
    id: uuid.UUID
    drop_id: uuid.UUID
    slot_id: uuid.UUID
    customer_id: uuid.UUID
    payment_method_tag: str
    payment_status: str
    status: str
    ready_text_sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    pizzas: list[OrderPizzaRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}
