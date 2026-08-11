"""Dashboard payload for plans priced above the market.

Shaped like ``UtilityPlanRenewalAlertResponse``: the card that consumes it
wants a short list plus a count, not a page of rows it has to filter itself.

Only *current* plans are measured. A superseded plan's price is history — the
operator cannot act on it, so flagging it would be noise.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.properties.utility_plan_rate_comparison_row import (
    UtilityPlanRateComparisonRow,
)


class UtilityPlanRateComparisonResponse(BaseModel):
    # The gap that had to be exceeded for a row to land in ``above_market``, so
    # the UI can say "more than N% above" without hardcoding the backend's
    # threshold.
    material_gap_pct: float
    # Sorted widest gap first — the most expensive mistake reads first.
    above_market: list[UtilityPlanRateComparisonRow]
    # Current plans that could not be measured: no benchmark recorded for their
    # service type, a regulated tariff with no competing supplier, or a missing
    # figure on either side. Surfaced rather than dropped, because "we are not
    # checking this one" is itself something the operator should see.
    not_compared: list[UtilityPlanRateComparisonRow]
    total_above_market: int
    # True when any benchmark feeding this payload is past its freshness
    # window, so the card can caveat the whole set in one line.
    has_stale_benchmark: bool

    model_config = ConfigDict(from_attributes=True)
