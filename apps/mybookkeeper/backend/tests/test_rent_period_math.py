"""Unit tests for rent period arithmetic.

Pure functions — no database, no clock. These cover the tiling rules the whole
ledger rests on: month-end clamping, period lookup, and end-date proration.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

import pytest

from app.services.rent import rent_period_math as m


class TestAddMonths:
    def test_advances_whole_months(self) -> None:
        assert m.add_months(_dt.date(2026, 1, 15), 1) == _dt.date(2026, 2, 15)
        assert m.add_months(_dt.date(2026, 1, 15), 12) == _dt.date(2027, 1, 15)

    def test_clamps_to_short_month(self) -> None:
        assert m.add_months(_dt.date(2026, 1, 31), 1) == _dt.date(2026, 2, 28)

    def test_clamping_does_not_drift(self) -> None:
        """A Jan-31 start must return to the 31st, not stay on the 28th.

        Every step is computed from the original start, so the clamp applies
        per-step rather than compounding.
        """
        start = _dt.date(2026, 1, 31)
        assert [m.add_months(start, i) for i in range(5)] == [
            _dt.date(2026, 1, 31),
            _dt.date(2026, 2, 28),
            _dt.date(2026, 3, 31),
            _dt.date(2026, 4, 30),
            _dt.date(2026, 5, 31),
        ]

    def test_leap_year_february(self) -> None:
        assert m.add_months(_dt.date(2028, 1, 31), 1) == _dt.date(2028, 2, 29)


class TestPeriodBounds:
    def test_monthly_period_is_inclusive_and_tiles(self) -> None:
        begin, end = m.period_bounds(_dt.date(2026, 1, 1), "monthly", 7)
        assert (begin, end) == (_dt.date(2026, 8, 1), _dt.date(2026, 8, 31))
        next_begin, _ = m.period_bounds(_dt.date(2026, 1, 1), "monthly", 8)
        assert next_begin == end + _dt.timedelta(days=1)

    def test_mid_month_start_bills_mid_month_to_mid_month(self) -> None:
        begin, end = m.period_bounds(_dt.date(2026, 8, 15), "monthly", 0)
        assert (begin, end) == (_dt.date(2026, 8, 15), _dt.date(2026, 9, 14))

    def test_weekly_period_is_seven_days(self) -> None:
        begin, end = m.period_bounds(_dt.date(2026, 8, 3), "weekly", 2)
        assert (begin, end) == (_dt.date(2026, 8, 17), _dt.date(2026, 8, 23))

    def test_biweekly_period_is_fourteen_days(self) -> None:
        begin, end = m.period_bounds(_dt.date(2026, 8, 3), "biweekly", 1)
        assert (begin, end) == (_dt.date(2026, 8, 17), _dt.date(2026, 8, 30))

    def test_rejects_unknown_cadence(self) -> None:
        with pytest.raises(ValueError, match="unknown cadence"):
            m.period_bounds(_dt.date(2026, 1, 1), "quarterly", 0)

    def test_rejects_negative_index(self) -> None:
        with pytest.raises(ValueError, match="must be >= 0"):
            m.period_bounds(_dt.date(2026, 1, 1), "monthly", -1)


class TestPeriodIndexFor:
    def test_none_before_schedule_start(self) -> None:
        assert m.period_index_for(_dt.date(2026, 8, 1), "monthly", _dt.date(2026, 7, 31)) is None

    def test_first_day_is_index_zero(self) -> None:
        assert m.period_index_for(_dt.date(2026, 8, 1), "monthly", _dt.date(2026, 8, 1)) == 0

    def test_finds_correct_month(self) -> None:
        assert m.period_index_for(_dt.date(2026, 1, 1), "monthly", _dt.date(2026, 8, 15)) == 7

    def test_handles_clamped_month_boundaries(self) -> None:
        """Jan-31 schedule: Feb 28 and Mar 30 both sit in period 1."""
        start = _dt.date(2026, 1, 31)
        assert m.period_index_for(start, "monthly", _dt.date(2026, 2, 28)) == 1
        assert m.period_index_for(start, "monthly", _dt.date(2026, 3, 30)) == 1
        assert m.period_index_for(start, "monthly", _dt.date(2026, 3, 31)) == 2

    def test_weekly_divides(self) -> None:
        start = _dt.date(2026, 8, 3)
        assert m.period_index_for(start, "weekly", _dt.date(2026, 8, 9)) == 0
        assert m.period_index_for(start, "weekly", _dt.date(2026, 8, 10)) == 1


class TestPeriodsThrough:
    def test_includes_the_period_containing_through(self) -> None:
        """The current period counts — rent is owed from its first day."""
        periods = m.periods_through(
            _dt.date(2026, 6, 1), "monthly", _dt.date(2026, 8, 1),
        )
        assert [p[0] for p in periods] == [0, 1, 2]
        assert periods[-1][1] == _dt.date(2026, 8, 1)

    def test_empty_before_start(self) -> None:
        assert m.periods_through(
            _dt.date(2026, 8, 1), "monthly", _dt.date(2026, 7, 1),
        ) == []

    def test_truncates_final_period_at_end_date(self) -> None:
        periods = m.periods_through(
            _dt.date(2026, 6, 1), "monthly", _dt.date(2026, 12, 31),
            end_date=_dt.date(2026, 8, 15),
        )
        assert len(periods) == 3
        assert periods[-1][1:] == (_dt.date(2026, 8, 1), _dt.date(2026, 8, 15))

    def test_emits_no_period_starting_after_end_date(self) -> None:
        periods = m.periods_through(
            _dt.date(2026, 6, 1), "monthly", _dt.date(2026, 12, 31),
            end_date=_dt.date(2026, 7, 31),
        )
        assert [p[0] for p in periods] == [0, 1]


class TestProratedAmount:
    def test_whole_period_is_unchanged(self) -> None:
        assert m.prorated_amount(
            Decimal("1500.00"), _dt.date(2026, 8, 1), _dt.date(2026, 8, 31),
            _dt.date(2026, 6, 1), "monthly", 2,
        ) == Decimal("1500.00")

    def test_truncated_tail_is_scaled_by_actual_days(self) -> None:
        # 15 of August's 31 days.
        assert m.prorated_amount(
            Decimal("1500.00"), _dt.date(2026, 8, 1), _dt.date(2026, 8, 15),
            _dt.date(2026, 6, 1), "monthly", 2,
        ) == Decimal("725.81")

    def test_single_day_tail(self) -> None:
        assert m.prorated_amount(
            Decimal("1500.00"), _dt.date(2026, 8, 1), _dt.date(2026, 8, 1),
            _dt.date(2026, 6, 1), "monthly", 2,
        ) == Decimal("48.39")

    def test_rounds_to_cents(self) -> None:
        result = m.prorated_amount(
            Decimal("1000.00"), _dt.date(2026, 8, 1), _dt.date(2026, 8, 10),
            _dt.date(2026, 8, 1), "monthly", 0,
        )
        assert result.as_tuple().exponent == -2
