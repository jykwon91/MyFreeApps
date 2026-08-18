"""Payload for recording a mortgage."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.core.mortgage_enums import RATE_TYPE_ARM, RATE_TYPES


class MortgageCreateRequest(BaseModel):
    property_id: uuid.UUID
    # No default. Whether the rate can move is the one thing this feature
    # cannot infer and cannot proceed without, so the form has to ask rather
    # than assume the common case.
    rate_type: str
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

    @model_validator(mode="after")
    def check_consistency(self) -> "MortgageCreateRequest":
        if self.rate_type not in RATE_TYPES:
            raise ValueError(f"rate_type must be one of {RATE_TYPES}")
        if self.fixed_until is not None and self.rate_type != RATE_TYPE_ARM:
            raise ValueError("fixed_until applies only to an adjustable-rate loan")
        if (self.current_balance_cents is None) != (self.statement_date is None):
            raise ValueError(
                "current_balance_cents and statement_date must be given together"
            )
        return self
