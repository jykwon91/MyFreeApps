"""Financials rollup schema for ``GET /financials/drops/{drop_id}``.

The owner-facing financials page consumes one read shape: drop identity +
numbers + a health badge. Expenses are returned alongside so the page
doesn't need a second roundtrip on initial render; subsequent mutations
re-fetch via the expenses endpoint.
"""
from __future__ import annotations

import uuid
from datetime import date as _date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.expense.expense_schemas import ExpenseRead


DropHealth = Literal["green", "amber", "red"]


class DropFinancialsHeader(BaseModel):
    """Identity + status for the financials view -- not the full Drop shape."""

    id: uuid.UUID
    name: str
    date: _date
    status: str  # planning | active | closed


class TipUpdate(BaseModel):
    """Body for ``PATCH /financials/drops/{drop_id}/tip``."""

    tip_total: Decimal = Field(max_digits=10, decimal_places=2, ge=0)


class DropFinancials(BaseModel):
    """The full payload returned by ``GET /financials/drops/{drop_id}``.

    All money fields are Decimal so the frontend can format with proper
    rounding rather than relying on float precision.
    """

    drop: DropFinancialsHeader
    pizza_count: int  # non-no-show pizzas across the drop
    revenue: Decimal  # gross from order_pizza.price_snapshot + topping deltas
    tip_total: Decimal
    expense_total: Decimal
    profit: Decimal  # revenue + tip - expense_total
    health: DropHealth
    expenses: list[ExpenseRead] = Field(default_factory=list)
