"""Summary row for the utility-plan list view.

``property_name``, ``renewal_status`` and ``days_until_term_end`` are joined /
derived by the service — they are not columns. See
``utility_plan_service.renewal_status``.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class UtilityPlanSummary(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    property_name: str | None = None
    service_type: str
    provider_name: str
    plan_name: str | None = None
    rate_type: str
    avg_price_cents_per_kwh_at_1000: Decimal | None = None
    term_end_date: _dt.date | None = None
    # Negative once the term has lapsed, which is the case worth seeing.
    days_until_term_end: int | None = None
    renewal_status: str
    is_current: bool
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
