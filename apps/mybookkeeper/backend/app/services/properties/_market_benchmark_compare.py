"""Pure comparison of one plan against one benchmark.

No I/O, no ORM — every function takes plain values so the arithmetic that
decides whether a badge lights up is directly testable without a database.

The comparison is deliberately shallow. It answers "is this plan priced well
above what the market charges?" and nothing more. It does not net off an early
termination fee, model a bill credit against a usage distribution, or project an
annual saving from historical kWh. Those belong to deciding whether to *act*,
and requiring them would mean the flag could not fire until a complete cost
model existed — which is precisely how a comparison feature ends up never
shipping. Surface the gap; let the operator open the drill-down.

Both sides of the comparison pick their figure from ``service_type`` via
``is_flat_rate_service``, never from "whichever column happens to be populated".
Deriving the two sides by different rules is how a monthly dollar amount ends up
being divided by a per-kWh rate.
"""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from app.core.market_benchmark_constants import (
    BENCHMARK_STALE_AFTER_DAYS,
    BENCHMARK_STATUS_ABOVE,
    BENCHMARK_STATUS_AT_OR_BELOW,
    BENCHMARK_STATUS_NO_BENCHMARK,
    BENCHMARK_STATUS_NOT_COMPARABLE,
    MATERIAL_GAP_PCT,
    is_flat_rate_service,
)
from app.core.utility_plan_constants import RATE_TYPE_REGULATED


class ComparablePlan(Protocol):
    """The parts of a utility plan this module measures."""

    service_type: str
    rate_type: str
    monthly_base_charge_cents: int | None
    equipment_fee_monthly_cents: int | None
    avg_price_cents_per_kwh_at_1000: Decimal | None


class ComparableBenchmark(Protocol):
    """The parts of a market benchmark this module measures against."""

    service_type: str
    rate_cents_per_kwh: Decimal | None
    monthly_cents: int | None
    observed_on: _dt.date


@dataclass(frozen=True, slots=True)
class PlanComparison:
    """Outcome of measuring one plan against the market.

    ``gap_pct`` is signed — negative means the plan beats the market, which is
    worth showing rather than hiding, since it is the evidence that a previous
    switch worked.
    """

    status: str
    plan_figure: Decimal | None = None
    benchmark_figure: Decimal | None = None
    gap_pct: Decimal | None = None
    is_stale: bool = False


def comparable_plan_figure(plan: ComparablePlan) -> Decimal | None:
    """The plan's number in the same shape as its service type's benchmark.

    Metered service uses the advertised all-in average at 1,000 kWh — the
    figure competitors publish, and so the only one comparable without knowing
    this property's usage.

    A flat service (internet) uses monthly base **plus** equipment fee. A modem
    rental quoted outside the advertised price is still money leaving the
    account every month, and omitting it would systematically understate what
    the plan costs.
    """
    if is_flat_rate_service(plan.service_type):
        base = plan.monthly_base_charge_cents
        if base is None:
            return None
        equipment = plan.equipment_fee_monthly_cents or 0
        return Decimal(base + equipment)

    rate = plan.avg_price_cents_per_kwh_at_1000
    return None if rate is None else Decimal(rate)


def benchmark_figure(benchmark: ComparableBenchmark | None) -> Decimal | None:
    """The benchmark's number, in the shape its service type is priced in.

    Read from the column that service type is *supposed* to use rather than the
    one that happens to be populated, so a row that somehow escaped the CHECK
    yields no comparison instead of a wrong one.
    """
    if benchmark is None:
        return None
    if is_flat_rate_service(benchmark.service_type):
        monthly = benchmark.monthly_cents
        return None if monthly is None else Decimal(monthly)
    rate = benchmark.rate_cents_per_kwh
    return None if rate is None else Decimal(rate)


def is_stale(observed_on: _dt.date, *, today: _dt.date | None = None) -> bool:
    """True once an observation is too old to describe the current market."""
    reference = today or _dt.date.today()
    return (reference - observed_on).days > BENCHMARK_STALE_AFTER_DAYS


def compare(
    plan: ComparablePlan,
    benchmark: ComparableBenchmark | None,
    *,
    today: _dt.date | None = None,
    material_gap_pct: float = MATERIAL_GAP_PCT,
) -> PlanComparison:
    """Classify one plan against the benchmark for its service type.

    A ``regulated`` plan is never comparable no matter what figures exist: a
    tariffed monopoly has no competing supplier, so telling the operator it is
    above market would be advice they cannot act on.
    """
    if benchmark is None:
        return PlanComparison(status=BENCHMARK_STATUS_NO_BENCHMARK)

    market = benchmark_figure(benchmark)
    mine = comparable_plan_figure(plan)
    stale = is_stale(benchmark.observed_on, today=today)

    if plan.rate_type == RATE_TYPE_REGULATED or market is None or mine is None:
        return PlanComparison(
            status=BENCHMARK_STATUS_NOT_COMPARABLE, is_stale=stale,
        )

    gap_pct = (mine - market) / market * Decimal(100)
    status = (
        BENCHMARK_STATUS_ABOVE
        if gap_pct > Decimal(str(material_gap_pct))
        else BENCHMARK_STATUS_AT_OR_BELOW
    )
    return PlanComparison(
        status=status,
        plan_figure=mine,
        benchmark_figure=market,
        # Quantized for transport: the extra digits are false precision on two
        # hand-recorded numbers, and they make the JSON noisy to read.
        gap_pct=gap_pct.quantize(Decimal("0.1")),
        is_stale=stale,
    )
