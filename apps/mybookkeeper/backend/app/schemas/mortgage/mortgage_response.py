"""Schema for a single mortgage."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class MortgageResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    organization_id: uuid.UUID
    property_id: uuid.UUID
    property_name: str | None = None
    source_document_id: uuid.UUID | None = None
    lender: str | None = None
    account_number: str | None = None
    current_balance_cents: int | None = None
    statement_date: _dt.date | None = None
    original_principal_cents: int | None = None
    interest_rate: Decimal | None = None
    rate_type: str
    fixed_until: _dt.date | None = None
    maturity_date: _dt.date | None = None
    term_months: int | None = None
    monthly_principal_cents: int | None = None
    monthly_interest_cents: int | None = None
    monthly_escrow_cents: int | None = None
    notes: str | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
