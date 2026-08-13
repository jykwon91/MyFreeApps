"""The organization's recorded market observation, as returned to the client.

``rate_cents_per_1000_coverage`` and ``is_stale`` are both derived rather than
stored — the rate so it can never disagree with the premium and coverage it
comes from, and staleness so it cannot drift from the clock.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, computed_field

from app.services.insurance._insurance_benchmark_compare import (
    is_stale,
    rate_cents_per_1000_coverage,
)


class InsuranceBenchmarkResponse(BaseModel):
    id: uuid.UUID
    annual_premium_cents: int
    coverage_amount_cents: int
    region_label: str | None = None
    source: str | None = None
    observed_on: _dt.date
    notes: str | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def rate_cents_per_1000_coverage(self) -> Decimal | None:
        """The benchmark in the unit the comparison actually runs on.

        Surfaced so the UI can show the operator the same normalised figure
        their policies are measured against, instead of two raw numbers they
        would have to divide themselves.
        """
        rate = rate_cents_per_1000_coverage(
            self.annual_premium_cents, self.coverage_amount_cents,
        )
        return None if rate is None else rate.quantize(Decimal("0.01"))

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_stale(self) -> bool:
        """True once the observation is too old to describe the current market."""
        return is_stale(self.observed_on)

    model_config = ConfigDict(from_attributes=True)
