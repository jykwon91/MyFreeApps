"""Pydantic schemas for the per-drop expense surface."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator


def _validate_amount(v: Decimal) -> Decimal:
    if v <= 0:
        raise ValueError("Amount must be positive")
    return v


class ExpenseCreate(BaseModel):
    vendor: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=60)
    amount: Decimal = Field(max_digits=10, decimal_places=2)
    description: Optional[str] = Field(default=None, max_length=500)

    @field_validator("amount")
    @classmethod
    def _amount_positive(cls, v: Decimal) -> Decimal:
        return _validate_amount(v)


class ExpenseUpdate(BaseModel):
    """All fields optional; only supplied keys get patched."""

    vendor: Optional[str] = Field(default=None, min_length=1, max_length=100)
    category: Optional[str] = Field(default=None, min_length=1, max_length=60)
    amount: Optional[Decimal] = Field(default=None, max_digits=10, decimal_places=2)
    description: Optional[str] = Field(default=None, max_length=500)

    @field_validator("amount")
    @classmethod
    def _amount_positive(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        return _validate_amount(v) if v is not None else None


class ExpenseRead(BaseModel):
    id: uuid.UUID
    drop_id: uuid.UUID
    vendor: str
    category: str
    amount: Decimal
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
