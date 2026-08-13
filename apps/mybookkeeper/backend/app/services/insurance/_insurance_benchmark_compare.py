"""Pure comparison of one insurance policy against one benchmark.

No I/O, no ORM — every function takes plain values so the arithmetic that
decides whether a badge lights up is directly testable without a database.

Both sides are reduced to the same unit before anything is compared: **annual
premium per $1,000 of dwelling coverage**. Comparing raw premiums would call a
$1,400 policy on a $250,000 dwelling equal to a $1,400 policy on a $500,000 one,
when the second buys twice the protection for the same money. Normalising is
also the only way a county average assembled from mixed housing stock can be
measured against one specific policy.

The comparison is deliberately shallow. It answers "is this policy priced well
above what the market charges?" and nothing more. It does not adjust for roof
age, claims history, distance to a fire station, or the wind/hail deductible the
policy carries — all of which legitimately move a premium. Those belong to
deciding whether to *act*; requiring them would mean the flag could not fire
until a complete underwriting model existed, which is how a comparison feature
ends up never shipping. Surface the gap; let the operator judge it.
"""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from app.core.insurance_benchmark_constants import (
    BENCHMARK_STALE_AFTER_DAYS,
    BENCHMARK_STATUS_ABOVE,
    BENCHMARK_STATUS_AT_OR_BELOW,
    BENCHMARK_STATUS_NO_BENCHMARK,
    BENCHMARK_STATUS_NOT_COMPARABLE,
    CENTS_PER_COVERAGE_UNIT,
    MATERIAL_GAP_PCT,
)


class ComparablePolicy(Protocol):
    """The parts of an insurance policy this module measures."""

    premium_cents: int | None
    premium_frequency: str | None
    coverage_amount_cents: int | None


class ComparableBenchmark(Protocol):
    """The parts of a benchmark this module measures against."""

    annual_premium_cents: int
    coverage_amount_cents: int
    observed_on: _dt.date


@dataclass(frozen=True, slots=True)
class PolicyComparison:
    """Outcome of measuring one policy against the market.

    ``gap_pct`` is signed — negative means the policy beats the market, which is
    worth showing rather than hiding, since it is the evidence that a previous
    switch worked.
    """

    status: str
    policy_rate_cents_per_1000: Decimal | None = None
    benchmark_rate_cents_per_1000: Decimal | None = None
    gap_pct: Decimal | None = None
    is_stale: bool = False


def rate_cents_per_1000_coverage(
    annual_premium_cents: int | None, coverage_amount_cents: int | None,
) -> Decimal | None:
    """Annual premium expressed per $1,000 of dwelling coverage.

    ``None`` when either half is missing or the coverage is zero — an unpriced
    or uncovered policy has no rate, and saying so is different from saying the
    rate is zero.

    $1,344/yr against $500,000 of coverage is 268.8 cents per $1,000.
    """
    if annual_premium_cents is None or coverage_amount_cents is None:
        return None
    if coverage_amount_cents <= 0:
        return None
    coverage_units = Decimal(coverage_amount_cents) / Decimal(CENTS_PER_COVERAGE_UNIT)
    return Decimal(annual_premium_cents) / coverage_units


def is_stale(observed_on: _dt.date, *, today: _dt.date | None = None) -> bool:
    """True once an observation is too old to describe the current market."""
    reference = today or _dt.date.today()
    return (reference - observed_on).days > BENCHMARK_STALE_AFTER_DAYS


def compare(
    policy_annual_premium_cents: int | None,
    policy_coverage_amount_cents: int | None,
    benchmark: ComparableBenchmark | None,
    *,
    today: _dt.date | None = None,
    material_gap_pct: float = MATERIAL_GAP_PCT,
) -> PolicyComparison:
    """Classify one policy against the organization's benchmark.

    Takes the policy's *annualised* premium rather than the policy row, because
    annualising is ``premium_math``'s job and doing it in two places is how the
    two figures drift apart.
    """
    if benchmark is None:
        return PolicyComparison(status=BENCHMARK_STATUS_NO_BENCHMARK)

    stale = is_stale(benchmark.observed_on, today=today)
    market = rate_cents_per_1000_coverage(
        benchmark.annual_premium_cents, benchmark.coverage_amount_cents,
    )
    mine = rate_cents_per_1000_coverage(
        policy_annual_premium_cents, policy_coverage_amount_cents,
    )

    if market is None or mine is None:
        # A policy with a premium but no coverage amount lands here rather than
        # being compared on raw dollars. Comparing an unnormalised premium
        # against a normalised benchmark would be a confidently wrong verdict,
        # which is worse than declining to answer.
        return PolicyComparison(status=BENCHMARK_STATUS_NOT_COMPARABLE, is_stale=stale)

    gap_pct = (mine - market) / market * Decimal(100)
    status = (
        BENCHMARK_STATUS_ABOVE
        if gap_pct > Decimal(str(material_gap_pct))
        else BENCHMARK_STATUS_AT_OR_BELOW
    )
    return PolicyComparison(
        status=status,
        # Quantized for transport: the extra digits are false precision on a
        # hand-recorded benchmark, and they make the JSON noisy to read.
        policy_rate_cents_per_1000=mine.quantize(Decimal("0.01")),
        benchmark_rate_cents_per_1000=market.quantize(Decimal("0.01")),
        gap_pct=gap_pct.quantize(Decimal("0.1")),
        is_stale=stale,
    )
