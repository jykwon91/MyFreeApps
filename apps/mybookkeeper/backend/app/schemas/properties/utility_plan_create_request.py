"""Schema for POST /utility-plans."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.properties.utility_plan_validation import (
    MAX_RATE_CENTS,
    validate_plan_fields,
)


class UtilityPlanCreateRequest(BaseModel):
    property_id: uuid.UUID
    service_type: str
    provider_name: str = Field(..., min_length=1, max_length=255)
    rate_type: str
    account_number: str | None = Field(None, max_length=100)
    plan_name: str | None = Field(None, max_length=255)

    energy_charge_cents_per_kwh: Decimal | None = Field(
        None, ge=0, le=MAX_RATE_CENTS, decimal_places=4,
    )
    tdu_charge_cents_per_kwh: Decimal | None = Field(
        None, ge=0, le=MAX_RATE_CENTS, decimal_places=4,
    )
    avg_price_cents_per_kwh_at_1000: Decimal | None = Field(
        None, ge=0, le=MAX_RATE_CENTS, decimal_places=4,
    )
    monthly_base_charge_cents: int | None = Field(None, ge=0)

    term_months: int | None = Field(None, ge=0, le=600)
    service_start_date: _dt.date | None = None
    term_end_date: _dt.date | None = None
    early_termination_fee_cents: int | None = Field(None, ge=0)

    has_bill_credit: bool = False
    bill_credit_amount_cents: int | None = Field(None, ge=0)
    bill_credit_threshold_kwh: int | None = Field(None, ge=0)
    min_usage_fee_cents: int | None = Field(None, ge=0)
    min_usage_threshold_kwh: int | None = Field(None, ge=0)

    notes: str | None = Field(None, max_length=5000)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _check_fields(self) -> UtilityPlanCreateRequest:
        return validate_plan_fields(self)
