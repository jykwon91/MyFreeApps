"""Schema for a single utility plan (detail view)."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class UtilityPlanResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    organization_id: uuid.UUID
    property_id: uuid.UUID
    property_name: str | None = None

    service_type: str
    provider_name: str
    account_number: str | None = None
    plan_name: str | None = None
    rate_type: str

    energy_charge_cents_per_kwh: Decimal | None = None
    tdu_charge_cents_per_kwh: Decimal | None = None
    avg_price_cents_per_kwh_at_1000: Decimal | None = None
    monthly_base_charge_cents: int | None = None

    term_months: int | None = None
    service_start_date: _dt.date | None = None
    term_end_date: _dt.date | None = None
    early_termination_fee_cents: int | None = None

    has_bill_credit: bool
    bill_credit_amount_cents: int | None = None
    bill_credit_threshold_kwh: int | None = None
    min_usage_fee_cents: int | None = None
    min_usage_threshold_kwh: int | None = None

    post_promo_monthly_cents: int | None = None
    equipment_fee_monthly_cents: int | None = None
    download_mbps: int | None = None
    upload_mbps: int | None = None
    data_cap_gb: int | None = None

    source_document_id: uuid.UUID | None = None

    notes: str | None = None

    # Derived — see utility_plan_service.
    days_until_term_end: int | None = None
    renewal_status: str
    is_current: bool

    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
