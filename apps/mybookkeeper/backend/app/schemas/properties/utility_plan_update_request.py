"""Schema for PATCH /utility-plans/{id}.

``property_id`` is intentionally absent: moving a plan to a different property
would silently rewrite the other property's rate history. Delete and re-create
instead.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.properties.utility_plan_validation import (
    MAX_MBPS,
    MAX_RATE_CENTS,
    validate_plan_fields,
)


class UtilityPlanUpdateRequest(BaseModel):
    service_type: str | None = None
    provider_name: str | None = Field(None, min_length=1, max_length=255)
    rate_type: str | None = None
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

    has_bill_credit: bool | None = None
    bill_credit_amount_cents: int | None = Field(None, ge=0)
    bill_credit_threshold_kwh: int | None = Field(None, ge=0)
    min_usage_fee_cents: int | None = Field(None, ge=0)
    min_usage_threshold_kwh: int | None = Field(None, ge=0)

    post_promo_monthly_cents: int | None = Field(None, ge=0)
    equipment_fee_monthly_cents: int | None = Field(None, ge=0)
    download_mbps: int | None = Field(None, gt=0, le=MAX_MBPS)
    upload_mbps: int | None = Field(None, gt=0, le=MAX_MBPS)
    data_cap_gb: int | None = Field(None, gt=0)

    source_document_id: uuid.UUID | None = None

    notes: str | None = Field(None, max_length=5000)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _check_fields(self) -> UtilityPlanUpdateRequest:
        # Only the fields present in this payload are validated here. A partial
        # update that leaves the row inconsistent with a field it did NOT send
        # is caught by the table's CHECK constraints; the service re-validates
        # the merged row before flushing so that surfaces as a 422 too.
        return validate_plan_fields(self, partial=True)
