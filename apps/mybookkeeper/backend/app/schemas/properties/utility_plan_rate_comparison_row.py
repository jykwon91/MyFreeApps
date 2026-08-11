"""One plan measured against the market benchmark for its service type."""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.properties.utility_plan_summary import UtilityPlanSummary


class UtilityPlanRateComparisonRow(BaseModel):
    plan: UtilityPlanSummary
    # One of app.core.market_benchmark_constants.BENCHMARK_STATUSES.
    status: str
    # Both figures are in the unit the service type is compared in — ¢/kWh for
    # metered service, cents per month for flat service. The client reads the
    # unit from the plan's service_type rather than being told twice.
    plan_figure: Decimal | None = None
    benchmark_figure: Decimal | None = None
    # Signed: negative means the plan beats the market, which is worth showing
    # as the evidence that an earlier switch worked.
    gap_pct: Decimal | None = None
    # True when the benchmark behind this row is old enough that the comparison
    # deserves a caveat rather than a confident badge.
    benchmark_is_stale: bool = False

    model_config = ConfigDict(from_attributes=True)
