"""Pydantic schemas for the per-drop expense surface."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator
from app.schemas.text_fields.expense_category import ExpenseCategory
from app.schemas.text_fields.expense_description import ExpenseDescription
from app.schemas.text_fields.expense_vendor import ExpenseVendor


def _validate_amount(v: Decimal) -> Decimal:
    if v <= 0:
        raise ValueError("Amount must be positive")
    return v


class ExpenseCreate(BaseModel):
    vendor: ExpenseVendor
    category: ExpenseCategory
    amount: Decimal = Field(max_digits=10, decimal_places=2)
    description: Optional[ExpenseDescription] = None

    @field_validator("amount")
    @classmethod
    def _amount_positive(cls, v: Decimal) -> Decimal:
        return _validate_amount(v)


class ExpenseUpdate(BaseModel):
    """All fields optional; only supplied keys get patched."""

    vendor: Optional[ExpenseVendor] = None
    category: Optional[ExpenseCategory] = None
    amount: Optional[Decimal] = Field(default=None, max_digits=10, decimal_places=2)
    description: Optional[ExpenseDescription] = None

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
