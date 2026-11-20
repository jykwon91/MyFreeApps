"""Pydantic schemas for PizzaType + ToppingType.

The owner-facing menu management endpoints return + accept these shapes.
The combined ``MenuRead`` returns both lists in one call so the Menu page
renders without two round-trips.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.menu.menu_price import MenuPrice
from app.schemas.patch_base import PatchModel
from app.schemas.text_fields.pizza_description import PizzaDescription
from app.schemas.text_fields.required_name import RequiredName


# ---------------------------------------------------------------------------
# Pizza
# ---------------------------------------------------------------------------

class PizzaTypeCreate(BaseModel):
    name: RequiredName
    price: MenuPrice
    description: Optional[PizzaDescription] = None
    active: bool = True


class PizzaTypeUpdate(PatchModel):
    non_nullable_fields = frozenset({"name", "price", "active"})

    name: Optional[RequiredName] = None
    price: Optional[MenuPrice] = None
    description: Optional[PizzaDescription] = None
    active: Optional[bool] = None


class PizzaTypeRead(BaseModel):
    id: uuid.UUID
    name: str
    price: Decimal
    description: Optional[str] = None
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Topping
# ---------------------------------------------------------------------------

class ToppingTypeCreate(BaseModel):
    name: RequiredName
    price_delta: MenuPrice = Decimal("0.00")
    active: bool = True


class ToppingTypeUpdate(PatchModel):
    non_nullable_fields = frozenset({"name", "price_delta", "active"})

    name: Optional[RequiredName] = None
    price_delta: Optional[MenuPrice] = None
    active: Optional[bool] = None


class ToppingTypeRead(BaseModel):
    id: uuid.UUID
    name: str
    price_delta: Decimal
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Combined menu
# ---------------------------------------------------------------------------

class MenuRead(BaseModel):
    pizzas: list[PizzaTypeRead] = Field(default_factory=list)
    toppings: list[ToppingTypeRead] = Field(default_factory=list)
