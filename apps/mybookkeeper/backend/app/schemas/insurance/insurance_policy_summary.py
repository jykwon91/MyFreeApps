"""Summary row for the insurance policy list view."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, computed_field

from app.services.insurance.premium_math import annual_premium_cents


class InsurancePolicySummary(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    # Resolved by the service so the list can name the building without the
    # client holding its own copy of the property table.
    property_name: str | None = None
    policy_name: str
    carrier: str | None = None
    effective_date: _dt.date | None = None
    expiration_date: _dt.date | None = None
    coverage_amount_cents: int | None = None
    premium_cents: int | None = None
    premium_frequency: str | None = None
    deductible_cents: int | None = None
    wind_hail_deductible_pct: Decimal | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def annual_premium_cents(self) -> int | None:
        """The premium restated as a yearly total.

        Derived rather than stored so it can never disagree with the amount and
        period it comes from, and computed here rather than in the two callers
        so the list and the detail view cannot annualise differently.
        """
        return annual_premium_cents(self.premium_cents, self.premium_frequency)

    model_config = ConfigDict(from_attributes=True)
