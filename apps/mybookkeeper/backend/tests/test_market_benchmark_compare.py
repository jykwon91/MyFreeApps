"""Unit tests for the pure benchmark comparison.

No database — every function here takes plain values, which is the point of
keeping the arithmetic that decides whether a badge lights up out of the
service layer.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from app.core.market_benchmark_constants import (
    BENCHMARK_STALE_AFTER_DAYS,
    BENCHMARK_STATUS_ABOVE,
    BENCHMARK_STATUS_AT_OR_BELOW,
    BENCHMARK_STATUS_NO_BENCHMARK,
    BENCHMARK_STATUS_NOT_COMPARABLE,
)
from app.core.utility_plan_constants import (
    RATE_TYPE_FIXED,
    RATE_TYPE_REGULATED,
    SERVICE_TYPE_ELECTRICITY,
    SERVICE_TYPE_INTERNET,
    SERVICE_TYPE_NATURAL_GAS,
)
from app.services.properties._market_benchmark_compare import (
    benchmark_figure,
    comparable_plan_figure,
    compare,
    is_stale,
)

TODAY = _dt.date(2026, 8, 11)


class _Plan:
    """Minimal stand-in for the columns the comparison reads."""

    def __init__(
        self,
        *,
        service_type: str = SERVICE_TYPE_ELECTRICITY,
        rate_type: str = RATE_TYPE_FIXED,
        avg_price_cents_per_kwh_at_1000: Decimal | None = None,
        monthly_base_charge_cents: int | None = None,
        equipment_fee_monthly_cents: int | None = None,
    ) -> None:
        self.service_type = service_type
        self.rate_type = rate_type
        self.avg_price_cents_per_kwh_at_1000 = avg_price_cents_per_kwh_at_1000
        self.monthly_base_charge_cents = monthly_base_charge_cents
        self.equipment_fee_monthly_cents = equipment_fee_monthly_cents


class _Benchmark:
    def __init__(
        self,
        *,
        service_type: str = SERVICE_TYPE_ELECTRICITY,
        rate_cents_per_kwh: Decimal | None = None,
        monthly_cents: int | None = None,
        observed_on: _dt.date = TODAY,
    ) -> None:
        self.service_type = service_type
        self.rate_cents_per_kwh = rate_cents_per_kwh
        self.monthly_cents = monthly_cents
        self.observed_on = observed_on


class TestComparablePlanFigure:
    def test_metered_plan_uses_the_advertised_all_in_average(self) -> None:
        plan = _Plan(avg_price_cents_per_kwh_at_1000=Decimal("15.0600"))
        assert comparable_plan_figure(plan) == Decimal("15.0600")

    def test_internet_plan_adds_the_equipment_fee_to_the_base(self) -> None:
        """A modem rental is money leaving the account, so it counts."""
        plan = _Plan(
            service_type=SERVICE_TYPE_INTERNET,
            monthly_base_charge_cents=8000,
            equipment_fee_monthly_cents=1000,
        )
        assert comparable_plan_figure(plan) == Decimal(9000)

    def test_internet_plan_without_an_equipment_fee_uses_the_base_alone(self) -> None:
        plan = _Plan(
            service_type=SERVICE_TYPE_INTERNET,
            monthly_base_charge_cents=8000,
            equipment_fee_monthly_cents=None,
        )
        assert comparable_plan_figure(plan) == Decimal(8000)

    def test_missing_figure_is_none_rather_than_zero(self) -> None:
        """Zero would read as a free plan and flag every benchmark as beaten."""
        assert comparable_plan_figure(_Plan()) is None
        assert comparable_plan_figure(_Plan(service_type=SERVICE_TYPE_INTERNET)) is None


class TestBenchmarkFigure:
    def test_reads_the_shape_its_service_type_is_priced_in(self) -> None:
        assert benchmark_figure(
            _Benchmark(rate_cents_per_kwh=Decimal("11.1000")),
        ) == Decimal("11.1000")
        assert benchmark_figure(
            _Benchmark(service_type=SERVICE_TYPE_INTERNET, monthly_cents=6000),
        ) == Decimal(6000)

    def test_a_figure_in_the_wrong_shape_yields_no_comparison(self) -> None:
        """Both DB CHECK and service layer reject this; if one ever escaped,
        reading it would divide a per-kWh rate by a dollar amount and report a
        confidently wrong verdict. No figure beats a wrong figure."""
        assert benchmark_figure(
            _Benchmark(service_type=SERVICE_TYPE_ELECTRICITY, monthly_cents=6000),
        ) is None
        assert benchmark_figure(
            _Benchmark(
                service_type=SERVICE_TYPE_INTERNET,
                rate_cents_per_kwh=Decimal("11.1000"),
            ),
        ) is None

    def test_absent_benchmark_is_none(self) -> None:
        assert benchmark_figure(None) is None


class TestIsStale:
    def test_fresh_observation_is_not_stale(self) -> None:
        assert is_stale(TODAY - _dt.timedelta(days=1), today=TODAY) is False

    def test_boundary_day_is_not_yet_stale(self) -> None:
        observed = TODAY - _dt.timedelta(days=BENCHMARK_STALE_AFTER_DAYS)
        assert is_stale(observed, today=TODAY) is False

    def test_one_day_past_the_window_is_stale(self) -> None:
        observed = TODAY - _dt.timedelta(days=BENCHMARK_STALE_AFTER_DAYS + 1)
        assert is_stale(observed, today=TODAY) is True


class TestCompare:
    def test_no_benchmark_short_circuits(self) -> None:
        result = compare(_Plan(avg_price_cents_per_kwh_at_1000=Decimal("15")), None)
        assert result.status == BENCHMARK_STATUS_NO_BENCHMARK
        assert result.gap_pct is None

    def test_materially_higher_rate_is_above_market(self) -> None:
        """The operator's real case: 15.06¢ against an 11.1¢ market."""
        result = compare(
            _Plan(avg_price_cents_per_kwh_at_1000=Decimal("15.0600")),
            _Benchmark(rate_cents_per_kwh=Decimal("11.1000")),
            today=TODAY,
        )
        assert result.status == BENCHMARK_STATUS_ABOVE
        assert result.gap_pct == Decimal("35.7")
        assert result.plan_figure == Decimal("15.0600")
        assert result.benchmark_figure == Decimal("11.1000")

    def test_gap_inside_the_threshold_is_not_flagged(self) -> None:
        """9% apart is two hand-recorded numbers disagreeing, not an overpay."""
        result = compare(
            _Plan(avg_price_cents_per_kwh_at_1000=Decimal("12.0")),
            _Benchmark(rate_cents_per_kwh=Decimal("11.0")),
            today=TODAY,
        )
        assert result.status == BENCHMARK_STATUS_AT_OR_BELOW

    def test_threshold_is_exclusive_so_exactly_ten_percent_is_not_flagged(self) -> None:
        result = compare(
            _Plan(avg_price_cents_per_kwh_at_1000=Decimal("11.0")),
            _Benchmark(rate_cents_per_kwh=Decimal("10.0")),
            today=TODAY,
        )
        assert result.status == BENCHMARK_STATUS_AT_OR_BELOW
        assert result.gap_pct == Decimal("10.0")

    def test_beating_the_market_reports_a_negative_gap(self) -> None:
        result = compare(
            _Plan(avg_price_cents_per_kwh_at_1000=Decimal("9.0")),
            _Benchmark(rate_cents_per_kwh=Decimal("11.0")),
            today=TODAY,
        )
        assert result.status == BENCHMARK_STATUS_AT_OR_BELOW
        assert result.gap_pct < 0

    def test_regulated_plan_is_never_comparable(self) -> None:
        """A tariffed monopoly has no competitor to switch to."""
        result = compare(
            _Plan(
                service_type=SERVICE_TYPE_NATURAL_GAS,
                rate_type=RATE_TYPE_REGULATED,
                avg_price_cents_per_kwh_at_1000=Decimal("99.0"),
            ),
            _Benchmark(rate_cents_per_kwh=Decimal("11.0")),
            today=TODAY,
        )
        assert result.status == BENCHMARK_STATUS_NOT_COMPARABLE
        assert result.gap_pct is None

    def test_missing_plan_figure_is_not_comparable(self) -> None:
        result = compare(
            _Plan(),
            _Benchmark(rate_cents_per_kwh=Decimal("11.0")),
            today=TODAY,
        )
        assert result.status == BENCHMARK_STATUS_NOT_COMPARABLE

    def test_internet_comparison_uses_monthly_cents_on_both_sides(self) -> None:
        result = compare(
            _Plan(
                service_type=SERVICE_TYPE_INTERNET,
                monthly_base_charge_cents=8000,
                equipment_fee_monthly_cents=1500,
            ),
            _Benchmark(service_type=SERVICE_TYPE_INTERNET, monthly_cents=6000),
            today=TODAY,
        )
        assert result.status == BENCHMARK_STATUS_ABOVE
        assert result.plan_figure == Decimal(9500)

    def test_stale_benchmark_still_compares_but_is_marked(self) -> None:
        """Old data is worth caveating, not worth discarding."""
        result = compare(
            _Plan(avg_price_cents_per_kwh_at_1000=Decimal("15.0")),
            _Benchmark(
                rate_cents_per_kwh=Decimal("11.0"),
                observed_on=TODAY - _dt.timedelta(days=BENCHMARK_STALE_AFTER_DAYS + 1),
            ),
            today=TODAY,
        )
        assert result.status == BENCHMARK_STATUS_ABOVE
        assert result.is_stale is True

    def test_not_comparable_still_reports_staleness(self) -> None:
        result = compare(
            _Plan(rate_type=RATE_TYPE_REGULATED),
            _Benchmark(
                rate_cents_per_kwh=Decimal("11.0"),
                observed_on=TODAY - _dt.timedelta(days=BENCHMARK_STALE_AFTER_DAYS + 1),
            ),
            today=TODAY,
        )
        assert result.status == BENCHMARK_STATUS_NOT_COMPARABLE
        assert result.is_stale is True

    def test_threshold_is_caller_supplied(self) -> None:
        plan = _Plan(avg_price_cents_per_kwh_at_1000=Decimal("12.0"))
        benchmark = _Benchmark(rate_cents_per_kwh=Decimal("11.0"))
        assert (
            compare(plan, benchmark, today=TODAY, material_gap_pct=5.0).status
            == BENCHMARK_STATUS_ABOVE
        )
        assert (
            compare(plan, benchmark, today=TODAY, material_gap_pct=20.0).status
            == BENCHMARK_STATUS_AT_OR_BELOW
        )
