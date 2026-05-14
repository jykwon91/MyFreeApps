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


# ---------------------------------------------------------------------------
# Pizza
# ---------------------------------------------------------------------------

class PizzaTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    price: Decimal = Field(..., ge=0)
    description: Optional[str] = None
    active: bool = True


class PizzaTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    price: Optional[Decimal] = Field(None, ge=0)
    description: Optional[str] = None
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
    name: str = Field(..., min_length=1, max_length=100)
    price_delta: Decimal = Field(default=Decimal("0.00"), ge=0)
    active: bool = True


class ToppingTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    price_delta: Optional[Decimal] = Field(None, ge=0)
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
