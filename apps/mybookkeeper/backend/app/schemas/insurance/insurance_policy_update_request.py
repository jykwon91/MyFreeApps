"""Schema for PATCH /insurance-policies/{id}."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.insurance.insurance_policy_validation import validate_policy_fields


class InsurancePolicyUpdateRequest(BaseModel):
    source_document_id: uuid.UUID | None = None
    policy_name: str | None = Field(None, min_length=1, max_length=255)
    carrier: str | None = Field(None, max_length=255)
    policy_number: str | None = None
    effective_date: _dt.date | None = None
    expiration_date: _dt.date | None = None
    coverage_amount_cents: int | None = Field(None, ge=0)
    premium_cents: int | None = Field(None, gt=0)
    premium_frequency: str | None = None
    fees_and_taxes_cents: int | None = Field(None, ge=0)
    deductible_cents: int | None = Field(None, ge=0)
    wind_hail_deductible_pct: Decimal | None = Field(
        None, gt=0, le=100, decimal_places=2,
    )
    notes: str | None = Field(None, max_length=5000)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _check_fields(self) -> InsurancePolicyUpdateRequest:
        return validate_policy_fields(self, partial=True)
