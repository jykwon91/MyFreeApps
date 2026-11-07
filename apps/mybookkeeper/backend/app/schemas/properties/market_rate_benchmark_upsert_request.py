"""Schema for PUT /market-rate-benchmarks/{service_type}.

An upsert rather than a create/update pair: there is at most one benchmark per
(organization, service type), so the caller never needs to know whether one
already exists, and the route can be driven straight from a single form.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.dates.client_local_date import ClientLocalDate
from app.schemas.properties.utility_plan_validation import MAX_RATE_CENTS


class MarketRateBenchmarkUpsertRequest(BaseModel):
    # Exactly one of these two, matching ``chk_market_benchmark_one_shape``.
    # Metered service is compared on ¢/kWh, flat service on dollars per month;
    # a row carrying both could not say which comparison it participates in.
    rate_cents_per_kwh: Decimal | None = Field(
        None, gt=0, le=MAX_RATE_CENTS, decimal_places=4,
    )
    monthly_cents: int | None = Field(None, gt=0)

    source: str | None = Field(None, max_length=255)
    observed_on: _dt.date
    notes: str | None = Field(None, max_length=5000)

    # Not stored: the caller's date, which ``observed_on`` may not be after and
    # the returned staleness is measured from.
    today: ClientLocalDate

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _check_shape(self) -> MarketRateBenchmarkUpsertRequest:
        has_rate = self.rate_cents_per_kwh is not None
        has_monthly = self.monthly_cents is not None
        if has_rate == has_monthly:
            raise ValueError(
                "Provide exactly one of rate_cents_per_kwh (metered service) "
                "or monthly_cents (flat service).",
            )
        # A future-dated observation is a typo, not a forecast, and it would
        # make the staleness check permanently pass.
        if self.observed_on > self.today:
            raise ValueError("observed_on cannot be in the future.")
        return self
