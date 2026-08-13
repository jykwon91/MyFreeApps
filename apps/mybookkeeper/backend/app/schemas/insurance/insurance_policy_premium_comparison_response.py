"""Dashboard payload for policies priced above the market.

Shaped like ``UtilityPlanRateComparisonResponse`` so the two comparison cards
behave identically: a short list plus a count, not a page of rows the client has
to filter itself.

Only policies that have not expired are measured. A lapsed policy's price is
history — the operator cannot act on it, so flagging it would be noise.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.insurance.insurance_benchmark_response import (
    InsuranceBenchmarkResponse,
)
from app.schemas.insurance.insurance_policy_premium_comparison_row import (
    InsurancePolicyPremiumComparisonRow,
)


class InsurancePolicyPremiumComparisonResponse(BaseModel):
    # The gap that had to be exceeded for a row to land in ``above_market``, so
    # the UI can say "more than N% above" without hardcoding the threshold.
    material_gap_pct: float
    # The benchmark every row was measured against, echoed so the card can show
    # what it is comparing to — and when that figure was last observed — without
    # a second request. Null when none is recorded yet.
    benchmark: InsuranceBenchmarkResponse | None = None
    # Sorted widest gap first — the most expensive mistake reads first.
    above_market: list[InsurancePolicyPremiumComparisonRow]
    # Policies that could not be measured: no benchmark recorded, no premium, or
    # no coverage amount to normalise against. Surfaced rather than dropped,
    # because "we are not checking this one" is itself worth seeing.
    not_compared: list[InsurancePolicyPremiumComparisonRow]
    total_above_market: int
    # Every unexpired policy the comparison looked at, including the ones that
    # came back fine and so appear in neither list. Without it a portfolio
    # priced entirely at or below market is indistinguishable from an empty
    # one — both render as two empty lists, and only one of them is good news.
    total_considered: int
    # True when the benchmark is past its freshness window, so the card can
    # caveat the whole set in one line.
    has_stale_benchmark: bool

    model_config = ConfigDict(from_attributes=True)
