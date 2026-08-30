"""Unit tests for rent period arithmetic.

Pure functions — no database, no clock. These cover the tiling rules the whole
ledger rests on: calendar-month alignment, period lookup, and proration at
either end of a schedule.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

import pytest

from app.services.rent import rent_period_math as m


class TestMonthHelpers:
    def test_month_first_advances_whole_months(self) -> None:
        assert m.month_first(_dt.date(2026, 1, 15), 0) == _dt.date(2026, 1, 1)
        assert m.month_first(_dt.date(2026, 1, 15), 1) == _dt.date(2026, 2, 1)
        assert m.month_first(_dt.date(2026, 1, 15), 12) == _dt.date(2027, 1, 1)

    def test_month_first_ignores_the_day_of_month(self) -> None:
        """The 1st of next month is the 1st regardless of where you started.

        This is what removes the day-clamping drift that anniversary-day
        tiling needed: there is no day to clamp.
        """
        assert m.month_first(_dt.date(2026, 1, 31), 1) == _dt.date(2026, 2, 1)
        assert m.month_first(_dt.date(2026, 1, 1), 1) == _dt.date(2026, 2, 1)

    def test_month_last_handles_short_and_leap_months(self) -> None:
        assert m.month_last(_dt.date(2026, 2, 10)) == _dt.date(2026, 2, 28)
        assert m.month_last(_dt.date(2028, 2, 10)) == _dt.date(2028, 2, 29)
        assert m.month_last(_dt.date(2026, 4, 1)) == _dt.date(2026, 4, 30)


class TestPeriodBounds:
    def test_monthly_period_is_inclusive_and_tiles(self) -> None:
        begin, end = m.period_bounds(_dt.date(2026, 1, 1), "monthly", 7)
        assert (begin, end) == (_dt.date(2026, 8, 1), _dt.date(2026, 8, 31))
        next_begin, _ = m.period_bounds(_dt.date(2026, 1, 1), "monthly", 8)
        assert next_begin == end + _dt.timedelta(days=1)

    def test_mid_month_start_bills_to_the_end_of_that_month(self) -> None:
        """A mid-month move-in is a short first period, not a shifted one."""
        assert m.period_bounds(_dt.date(2026, 8, 15), "monthly", 0) == (
            _dt.date(2026, 8, 15), _dt.date(2026, 8, 31),
        )

    def test_period_after_a_mid_month_start_is_a_whole_calendar_month(self) -> None:
        assert m.period_bounds(_dt.date(2026, 8, 15), "monthly", 1) == (
            _dt.date(2026, 9, 1), _dt.date(2026, 9, 30),
        )

    def test_month_end_start_bills_a_single_day_then_whole_months(self) -> None:
        start = _dt.date(2026, 1, 31)
        assert m.period_bounds(start, "monthly", 0) == (start, _dt.date(2026, 1, 31))
        assert m.period_bounds(start, "monthly", 1) == (
            _dt.date(2026, 2, 1), _dt.date(2026, 2, 28),
        )

    def test_natural_bounds_is_the_whole_month_even_for_a_clipped_period(self) -> None:
        """The proration denominator is the month, not the billed span."""
        assert m.natural_bounds(_dt.date(2026, 8, 15), "monthly", 0) == (
            _dt.date(2026, 8, 1), _dt.date(2026, 8, 31),
        )

    def test_weekly_period_is_seven_days(self) -> None:
        begin, end = m.period_bounds(_dt.date(2026, 8, 3), "weekly", 2)
        assert (begin, end) == (_dt.date(2026, 8, 17), _dt.date(2026, 8, 23))

    def test_biweekly_period_is_fourteen_days(self) -> None:
        begin, end = m.period_bounds(_dt.date(2026, 8, 3), "biweekly", 1)
        assert (begin, end) == (_dt.date(2026, 8, 17), _dt.date(2026, 8, 30))

    def test_weekly_ignores_calendar_months(self) -> None:
        """A weekly obligation has no month boundary to align to."""
        assert m.period_bounds(_dt.date(2026, 8, 26), "weekly", 0) == (
            _dt.date(2026, 8, 26), _dt.date(2026, 9, 1),
        )

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

    def test_mid_month_start_keeps_the_rest_of_that_month_in_period_zero(self) -> None:
        start = _dt.date(2026, 8, 15)
        assert m.period_index_for(start, "monthly", _dt.date(2026, 8, 31)) == 0
        assert m.period_index_for(start, "monthly", _dt.date(2026, 9, 1)) == 1

    def test_month_end_start_rolls_over_on_the_first(self) -> None:
        start = _dt.date(2026, 1, 31)
        assert m.period_index_for(start, "monthly", _dt.date(2026, 1, 31)) == 0
        assert m.period_index_for(start, "monthly", _dt.date(2026, 2, 28)) == 1
        assert m.period_index_for(start, "monthly", _dt.date(2026, 3, 1)) == 2

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

    def test_mid_month_move_in_then_whole_months(self) -> None:
        periods = m.periods_through(
            _dt.date(2026, 8, 15), "monthly", _dt.date(2026, 10, 5),
        )
        assert [p[1:] for p in periods] == [
            (_dt.date(2026, 8, 15), _dt.date(2026, 8, 31)),
            (_dt.date(2026, 9, 1), _dt.date(2026, 9, 30)),
            (_dt.date(2026, 10, 1), _dt.date(2026, 10, 31)),
        ]

    def test_move_in_and_out_inside_one_month_is_a_single_period(self) -> None:
        periods = m.periods_through(
            _dt.date(2026, 8, 15), "monthly", _dt.date(2026, 12, 31),
            end_date=_dt.date(2026, 8, 20),
        )
        assert [p[1:] for p in periods] == [
            (_dt.date(2026, 8, 15), _dt.date(2026, 8, 20)),
        ]


class TestProratedAmount:
    def test_whole_period_is_unchanged(self) -> None:
        assert m.prorated_amount(
            Decimal("1500.00"), _dt.date(2026, 8, 1), _dt.date(2026, 8, 31),
            _dt.date(2026, 6, 1), "monthly", 2,
        ) == Decimal("1500.00")

    def test_mid_month_move_in_is_scaled_by_days_lived(self) -> None:
        """Aug 15 move-in: 17 of August's 31 days of a $1,500 month."""
        assert m.prorated_amount(
            Decimal("1500.00"), _dt.date(2026, 8, 15), _dt.date(2026, 8, 31),
            _dt.date(2026, 8, 15), "monthly", 0,
        ) == Decimal("822.58")

    def test_the_month_after_a_prorated_move_in_is_full(self) -> None:
        assert m.prorated_amount(
            Decimal("1500.00"), _dt.date(2026, 9, 1), _dt.date(2026, 9, 30),
            _dt.date(2026, 8, 15), "monthly", 1,
        ) == Decimal("1500.00")

    def test_truncated_tail_is_scaled_by_actual_days(self) -> None:
        # 15 of August's 31 days.
        assert m.prorated_amount(
            Decimal("1500.00"), _dt.date(2026, 8, 1), _dt.date(2026, 8, 15),
            _dt.date(2026, 6, 1), "monthly", 2,
        ) == Decimal("725.81")

    def test_short_at_both_ends_in_one_month(self) -> None:
        """Moved in Aug 15 and out Aug 20: 6 days, billed once."""
        assert m.prorated_amount(
            Decimal("1500.00"), _dt.date(2026, 8, 15), _dt.date(2026, 8, 20),
            _dt.date(2026, 8, 15), "monthly", 0,
        ) == Decimal("290.32")

    def test_denominator_is_the_month_not_a_fixed_thirty(self) -> None:
        """February's shorter month makes each of its days worth more.

        Deliberately unlike ``inquiry_rent_proration``'s 30-day convention:
        that module prices a hypothetical stay, this one bills a real month.
        """
        february = m.prorated_amount(
            Decimal("1400.00"), _dt.date(2026, 2, 15), _dt.date(2026, 2, 28),
            _dt.date(2026, 2, 15), "monthly", 0,
        )
        assert february == Decimal("700.00")  # 14 of 28 days, exactly half

    def test_single_day_tail(self) -> None:
        assert m.prorated_amount(
            Decimal("1500.00"), _dt.date(2026, 8, 1), _dt.date(2026, 8, 1),
            _dt.date(2026, 6, 1), "monthly", 2,
        ) == Decimal("48.39")

    def test_weekly_periods_are_never_prorated_by_the_calendar(self) -> None:
        """A full week spanning a month boundary is still a full week."""
        assert m.prorated_amount(
            Decimal("375.00"), _dt.date(2026, 8, 26), _dt.date(2026, 9, 1),
            _dt.date(2026, 8, 26), "weekly", 0,
        ) == Decimal("375.00")

    def test_rounds_to_cents(self) -> None:
        result = m.prorated_amount(
            Decimal("1000.00"), _dt.date(2026, 8, 1), _dt.date(2026, 8, 10),
            _dt.date(2026, 8, 1), "monthly", 0,
        )
        assert result.as_tuple().exponent == -2
