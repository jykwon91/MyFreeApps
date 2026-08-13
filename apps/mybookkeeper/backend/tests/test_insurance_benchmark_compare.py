"""Unit tests for the pure insurance-premium comparison.

No database — every function here takes plain values, which is the point of
keeping the arithmetic that decides whether a badge lights up out of the
service layer.

The case that matters most is normalisation: two policies with the same premium
and different coverage are not the same deal, and a comparison that missed that
would flag the wrong one.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from app.core.insurance_benchmark_constants import (
    BENCHMARK_STALE_AFTER_DAYS,
    BENCHMARK_STATUS_ABOVE,
    BENCHMARK_STATUS_AT_OR_BELOW,
    BENCHMARK_STATUS_NO_BENCHMARK,
    BENCHMARK_STATUS_NOT_COMPARABLE,
    MATERIAL_GAP_PCT,
)
from app.services.insurance._insurance_benchmark_compare import (
    compare,
    is_stale,
    rate_cents_per_1000_coverage,
)

TODAY = _dt.date(2026, 8, 13)

# $1,200/yr on $400,000 of coverage — 300 cents per $1,000.
MARKET_PREMIUM_CENTS = 120_000
MARKET_COVERAGE_CENTS = 40_000_000_00 // 100  # $400,000 in cents


class _Benchmark:
    """Minimal stand-in for the columns the comparison reads."""

    def __init__(
        self,
        *,
        annual_premium_cents: int = MARKET_PREMIUM_CENTS,
        coverage_amount_cents: int = MARKET_COVERAGE_CENTS,
        observed_on: _dt.date = TODAY,
    ) -> None:
        self.annual_premium_cents = annual_premium_cents
        self.coverage_amount_cents = coverage_amount_cents
        self.observed_on = observed_on


class TestRateCentsPer1000Coverage:
    def test_divides_the_premium_by_coverage_in_thousands(self) -> None:
        # $1,344/yr on $500,000 → 500 units of $1,000 → 268.8 cents each.
        assert rate_cents_per_1000_coverage(134_400, 50_000_000) == Decimal("268.8")

    def test_same_premium_on_more_coverage_is_a_lower_rate(self) -> None:
        """The whole reason the comparison normalises at all."""
        small = rate_cents_per_1000_coverage(140_000, 25_000_000)
        large = rate_cents_per_1000_coverage(140_000, 50_000_000)
        assert small is not None and large is not None
        assert large < small

    def test_missing_half_yields_no_rate_rather_than_zero(self) -> None:
        """Zero would read as a free policy and beat every benchmark."""
        assert rate_cents_per_1000_coverage(None, 50_000_000) is None
        assert rate_cents_per_1000_coverage(134_400, None) is None

    def test_zero_coverage_yields_no_rate_rather_than_dividing(self) -> None:
        assert rate_cents_per_1000_coverage(134_400, 0) is None
        assert rate_cents_per_1000_coverage(134_400, -1) is None


class TestIsStale:
    def test_fresh_observation_is_not_stale(self) -> None:
        assert is_stale(TODAY - _dt.timedelta(days=1), today=TODAY) is False

    def test_boundary_day_is_not_yet_stale(self) -> None:
        observed = TODAY - _dt.timedelta(days=BENCHMARK_STALE_AFTER_DAYS)
        assert is_stale(observed, today=TODAY) is False

    def test_one_day_past_the_window_is_stale(self) -> None:
        observed = TODAY - _dt.timedelta(days=BENCHMARK_STALE_AFTER_DAYS + 1)
        assert is_stale(observed, today=TODAY) is True

    def test_window_is_a_year_because_policies_reprice_at_renewal(self) -> None:
        """Shorter than a year would flag a benchmark stale before the thing it
        measures has had any chance to change."""
        assert BENCHMARK_STALE_AFTER_DAYS >= 365


class TestCompare:
    def test_no_benchmark_short_circuits(self) -> None:
        result = compare(134_400, 50_000_000, None)
        assert result.status == BENCHMARK_STATUS_NO_BENCHMARK
        assert result.gap_pct is None

    def test_materially_higher_rate_is_above_market(self) -> None:
        # $2,000/yr on $400,000 → 500¢ per $1,000 against a 300¢ market: +66.7%.
        result = compare(200_000, MARKET_COVERAGE_CENTS, _Benchmark(), today=TODAY)
        assert result.status == BENCHMARK_STATUS_ABOVE
        assert result.policy_rate_cents_per_1000 == Decimal("500.00")
        assert result.benchmark_rate_cents_per_1000 == Decimal("300.00")
        assert result.gap_pct == Decimal("66.7")

    def test_gap_inside_the_threshold_is_not_flagged(self) -> None:
        """A county average spans houses that legitimately differ by more than
        a rounding error — 20% apart is not evidence of overpaying."""
        result = compare(144_000, MARKET_COVERAGE_CENTS, _Benchmark(), today=TODAY)
        assert result.gap_pct == Decimal("20.0")
        assert result.status == BENCHMARK_STATUS_AT_OR_BELOW

    def test_threshold_is_exclusive_so_exactly_the_threshold_is_not_flagged(
        self,
    ) -> None:
        premium = int(MARKET_PREMIUM_CENTS * (1 + MATERIAL_GAP_PCT / 100))
        result = compare(premium, MARKET_COVERAGE_CENTS, _Benchmark(), today=TODAY)
        assert result.gap_pct == Decimal(str(MATERIAL_GAP_PCT))
        assert result.status == BENCHMARK_STATUS_AT_OR_BELOW

    def test_beating_the_market_reports_a_negative_gap(self) -> None:
        result = compare(90_000, MARKET_COVERAGE_CENTS, _Benchmark(), today=TODAY)
        assert result.status == BENCHMARK_STATUS_AT_OR_BELOW
        assert result.gap_pct is not None and result.gap_pct < 0

    def test_more_coverage_for_the_same_premium_is_not_flagged(self) -> None:
        """The normalisation earning its keep: an identical premium buying twice
        the market's coverage is a bargain, not an overpay."""
        expensive_looking = compare(
            MARKET_PREMIUM_CENTS,
            MARKET_COVERAGE_CENTS * 2,
            _Benchmark(),
            today=TODAY,
        )
        assert expensive_looking.status == BENCHMARK_STATUS_AT_OR_BELOW

    def test_policy_without_coverage_is_not_comparable(self) -> None:
        """Compared on raw dollars it would look cheap or dear at random."""
        result = compare(200_000, None, _Benchmark(), today=TODAY)
        assert result.status == BENCHMARK_STATUS_NOT_COMPARABLE
        assert result.gap_pct is None

    def test_policy_without_a_premium_is_not_comparable(self) -> None:
        result = compare(None, MARKET_COVERAGE_CENTS, _Benchmark(), today=TODAY)
        assert result.status == BENCHMARK_STATUS_NOT_COMPARABLE

    def test_stale_benchmark_still_compares_but_is_marked(self) -> None:
        """Old data is worth caveating, not worth discarding."""
        result = compare(
            200_000,
            MARKET_COVERAGE_CENTS,
            _Benchmark(
                observed_on=TODAY - _dt.timedelta(days=BENCHMARK_STALE_AFTER_DAYS + 1),
            ),
            today=TODAY,
        )
        assert result.status == BENCHMARK_STATUS_ABOVE
        assert result.is_stale is True

    def test_not_comparable_still_reports_staleness(self) -> None:
        result = compare(
            200_000,
            None,
            _Benchmark(
                observed_on=TODAY - _dt.timedelta(days=BENCHMARK_STALE_AFTER_DAYS + 1),
            ),
            today=TODAY,
        )
        assert result.status == BENCHMARK_STATUS_NOT_COMPARABLE
        assert result.is_stale is True

    def test_threshold_is_caller_supplied(self) -> None:
        args = (144_000, MARKET_COVERAGE_CENTS, _Benchmark())
        assert (
            compare(*args, today=TODAY, material_gap_pct=10.0).status
            == BENCHMARK_STATUS_ABOVE
        )
        assert (
            compare(*args, today=TODAY, material_gap_pct=50.0).status
            == BENCHMARK_STATUS_AT_OR_BELOW
        )
