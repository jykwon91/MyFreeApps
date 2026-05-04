"""Summary row for the insurance policy list view."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class InsurancePolicySummary(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID
    policy_name: str
    carrier: str | None = None
    effective_date: _dt.date | None = None
    expiration_date: _dt.date | None = None
    coverage_amount_cents: int | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
