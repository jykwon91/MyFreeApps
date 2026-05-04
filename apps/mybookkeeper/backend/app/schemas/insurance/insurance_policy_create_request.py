"""Schema for POST /insurance-policies."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict, Field


class InsurancePolicyCreateRequest(BaseModel):
    listing_id: uuid.UUID
    policy_name: str = Field(..., min_length=1, max_length=255)
    carrier: str | None = Field(None, max_length=255)
    policy_number: str | None = Field(None, max_length=255)
    effective_date: _dt.date | None = None
    expiration_date: _dt.date | None = None
    coverage_amount_cents: int | None = Field(None, ge=0)
    notes: str | None = Field(None, max_length=5000)

    model_config = ConfigDict(extra="forbid")
