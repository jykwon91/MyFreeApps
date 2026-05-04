"""Schema for PATCH /insurance-policies/{id}."""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict, Field


class InsurancePolicyUpdateRequest(BaseModel):
    policy_name: str | None = Field(None, min_length=1, max_length=255)
    carrier: str | None = Field(None, max_length=255)
    policy_number: str | None = None
    effective_date: _dt.date | None = None
    expiration_date: _dt.date | None = None
    coverage_amount_cents: int | None = Field(None, ge=0)
    notes: str | None = Field(None, max_length=5000)

    model_config = ConfigDict(extra="forbid")
