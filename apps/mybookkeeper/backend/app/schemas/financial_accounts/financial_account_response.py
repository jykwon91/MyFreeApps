"""One financial account as the API returns it."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class FinancialAccountResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    name: str
    institution_name: str | None = None
    account_type: str
    # "asset" or "liability", derived from ``account_type``.
    classification: str
    mask: str | None = None
    currency: str
    current_balance_cents: int | None = None
    balance_as_of: _dt.date | None = None
    closed_on: _dt.date | None = None
    mortgage_id: uuid.UUID | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
