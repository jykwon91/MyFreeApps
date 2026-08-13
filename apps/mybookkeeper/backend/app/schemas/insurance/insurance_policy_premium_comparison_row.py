"""One policy measured against the organization's insurance benchmark."""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.insurance.insurance_policy_summary import InsurancePolicySummary


class InsurancePolicyPremiumComparisonRow(BaseModel):
    policy: InsurancePolicySummary
    # One of app.core.insurance_benchmark_constants.BENCHMARK_STATUSES.
    status: str
    # Both figures are cents of annual premium per $1,000 of dwelling coverage.
    # Raw premiums are never compared — see _insurance_benchmark_compare.
    policy_rate_cents_per_1000: Decimal | None = None
    benchmark_rate_cents_per_1000: Decimal | None = None
    # Signed: negative means the policy beats the market, which is worth showing
    # as the evidence that an earlier switch worked.
    gap_pct: Decimal | None = None
    # True when the benchmark behind this row is old enough that the comparison
    # deserves a caveat rather than a confident badge.
    benchmark_is_stale: bool = False

    model_config = ConfigDict(from_attributes=True)
