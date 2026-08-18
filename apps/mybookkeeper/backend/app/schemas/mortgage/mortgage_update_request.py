"""Partial update payload for a mortgage.

Field-level bounds only. The pairings — a balance needs the date it was true
on, ``fixed_until`` belongs to an adjustable loan — depend on the row's other
columns, which a patch does not carry. Those are checked in
``mortgage_service`` against the merged result, and again by the database.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.core.mortgage_enums import RATE_TYPES


class MortgageUpdateRequest(BaseModel):
    property_id: uuid.UUID | None = None
    rate_type: str | None = None
    source_document_id: uuid.UUID | None = None
    lender: str | None = Field(default=None, max_length=255)
    account_number: str | None = Field(default=None, max_length=255)
    current_balance_cents: int | None = Field(default=None, ge=0)
    statement_date: _dt.date | None = None
    original_principal_cents: int | None = Field(default=None, gt=0)
    interest_rate: Decimal | None = Field(default=None, gt=0, lt=25)
    fixed_until: _dt.date | None = None
    maturity_date: _dt.date | None = None
    term_months: int | None = Field(default=None, gt=0, le=600)
    monthly_principal_cents: int | None = Field(default=None, ge=0)
    monthly_interest_cents: int | None = Field(default=None, ge=0)
    monthly_escrow_cents: int | None = Field(default=None, ge=0)
    notes: str | None = None

    @field_validator("rate_type")
    @classmethod
    def check_rate_type(cls, value: str | None) -> str | None:
        if value is not None and value not in RATE_TYPES:
            raise ValueError(f"rate_type must be one of {RATE_TYPES}")
        return value
