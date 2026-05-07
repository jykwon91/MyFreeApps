"""Unit tests for the inquiry_rent_proration helper.

Pure function — no DB / no async. Tests cover:
- 30-day stay returns the full monthly rate (no proration).
- Short stay (<30 days) returns prorated total.
- Long stay (>30 days) returns scaled total.
- Missing dates / monthly_rate / inverted dates return None.
- Cents rounding is HALF_UP.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from app.services.inquiries.inquiry_rent_proration import (
    estimated_total_rent,
    stay_duration_days,
)


class TestStayDurationDays:
    def test_returns_day_count(self) -> None:
        assert stay_duration_days(_dt.date(2026, 6, 1), _dt.date(2026, 6, 8)) == 7

    def test_returns_none_when_either_missing(self) -> None:
        assert stay_duration_days(None, _dt.date(2026, 6, 8)) is None
        assert stay_duration_days(_dt.date(2026, 6, 1), None) is None
        assert stay_duration_days(None, None) is None


class TestEstimatedTotalRent:
    def test_30_day_stay_returns_full_monthly_rate(self) -> None:
        total = estimated_total_rent(
            monthly_rate=Decimal("1500"),
            move_in_date=_dt.date(2026, 6, 1),
            move_out_date=_dt.date(2026, 7, 1),
        )
        assert total == Decimal("1500.00")

    def test_short_stay_prorates(self) -> None:
        # 7 days at $1500/mo → $1500 * 7/30 = $350.00
        total = estimated_total_rent(
            monthly_rate=Decimal("1500"),
            move_in_date=_dt.date(2026, 6, 1),
            move_out_date=_dt.date(2026, 6, 8),
        )
        assert total == Decimal("350.00")

    def test_long_stay_scales_linearly(self) -> None:
        # 90 days at $1500/mo → $4500.00
        total = estimated_total_rent(
            monthly_rate=Decimal("1500"),
            move_in_date=_dt.date(2026, 6, 1),
            move_out_date=_dt.date(2026, 8, 30),
        )
        assert total == Decimal("4500.00")

    def test_returns_none_when_monthly_rate_missing(self) -> None:
        assert estimated_total_rent(
            monthly_rate=None,
            move_in_date=_dt.date(2026, 6, 1),
            move_out_date=_dt.date(2026, 6, 8),
        ) is None

    def test_returns_none_when_dates_inverted(self) -> None:
        assert estimated_total_rent(
            monthly_rate=Decimal("1500"),
            move_in_date=_dt.date(2026, 6, 8),
            move_out_date=_dt.date(2026, 6, 1),
        ) is None

    def test_returns_none_when_dates_equal(self) -> None:
        assert estimated_total_rent(
            monthly_rate=Decimal("1500"),
            move_in_date=_dt.date(2026, 6, 1),
            move_out_date=_dt.date(2026, 6, 1),
        ) is None

    def test_rounds_to_cents_half_up(self) -> None:
        # 1 day at $1500/mo → $50.00 exactly. Pick a fractional case.
        # $1499/mo for 7 days → $349.7666... → $349.77
        total = estimated_total_rent(
            monthly_rate=Decimal("1499"),
            move_in_date=_dt.date(2026, 6, 1),
            move_out_date=_dt.date(2026, 6, 8),
        )
        assert total == Decimal("349.77")
