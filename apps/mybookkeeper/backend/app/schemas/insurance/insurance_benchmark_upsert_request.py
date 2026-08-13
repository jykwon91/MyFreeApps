"""Schema for PUT /insurance-benchmarks.

An upsert rather than a create/update pair: there is at most one benchmark per
organization, so the caller never needs to know whether one already exists, and
the route can be driven straight from a single form.

Both figures are required. A premium without the coverage it buys cannot be
normalised, and a benchmark that cannot participate in the comparison has no
reason to exist — so this refuses the half-set pair rather than storing a row
that would silently never match anything.
"""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict, Field, model_validator

# The browser fills this field with *its* local date, which can be a calendar
# day ahead of the server's. Rejecting on the server's date alone would 422 a
# user east of the server for picking their own today. One day of slack absorbs
# every real offset (max +14h) while still rejecting an actual forecast.
_FUTURE_DATE_SLACK = _dt.timedelta(days=1)

# $10,000,000/yr of premium and $1,000,000,000 of coverage are both far beyond
# any residential policy. The caps exist to catch a cents/dollars mix-up at the
# boundary rather than to express a real limit.
MAX_ANNUAL_PREMIUM_CENTS = 1_000_000_000
MAX_COVERAGE_AMOUNT_CENTS = 100_000_000_000


class InsuranceBenchmarkUpsertRequest(BaseModel):
    annual_premium_cents: int = Field(..., gt=0, le=MAX_ANNUAL_PREMIUM_CENTS)
    coverage_amount_cents: int = Field(..., gt=0, le=MAX_COVERAGE_AMOUNT_CENTS)

    region_label: str | None = Field(None, max_length=120)
    source: str | None = Field(None, max_length=255)
    observed_on: _dt.date
    notes: str | None = Field(None, max_length=5000)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _check_observed_on(self) -> InsuranceBenchmarkUpsertRequest:
        # A future-dated observation is a typo, not a forecast, and it would
        # make the staleness check permanently pass.
        if self.observed_on > _dt.date.today() + _FUTURE_DATE_SLACK:
            raise ValueError("observed_on cannot be in the future.")
        return self
