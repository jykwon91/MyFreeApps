"""Cash flow months, as pure functions.

Pinned: each range ends with this month (6M and 12M count back, YTD starts in
January, crossing a year boundary correctly); every month is listed, empty
ones as zero; rows outside the range are ignored; net is in - out.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from app.services.cash_flow import cash_flow_months


def test_six_months_cross_into_last_year() -> None:
    months = cash_flow_months.range_months("6m", _dt.date(2026, 2, 17))
    assert months[0] == _dt.date(2025, 9, 1)
    assert months[-1] == _dt.date(2026, 2, 1)
    assert len(months) == 6


def test_twelve_months_and_year_to_date() -> None:
    assert len(cash_flow_months.range_months("12m", _dt.date(2026, 7, 4))) == 12
    assert cash_flow_months.range_months("ytd", _dt.date(2026, 3, 31)) == [
        _dt.date(2026, 1, 1), _dt.date(2026, 2, 1), _dt.date(2026, 3, 1),
    ]
    assert cash_flow_months.range_months("ytd", _dt.date(2026, 1, 2)) == [_dt.date(2026, 1, 1)]


def test_every_month_is_listed_and_net_is_in_minus_out() -> None:
    months = [_dt.date(2026, 1, 1), _dt.date(2026, 2, 1), _dt.date(2026, 3, 1)]
    rows, totals = cash_flow_months.build_months(months, [
        (2026, 1, "income", Decimal("1000.00")),
        (2026, 1, "expense", Decimal("250.25")),
        (2026, 3, "expense", Decimal("10")),
        (2025, 12, "income", Decimal("999")),  # outside the range
    ])
    assert [r.month for r in rows] == ["2026-01", "2026-02", "2026-03"]
    assert (rows[0].money_in_cents, rows[0].money_out_cents, rows[0].net_cents) == (1000_00, 250_25, 749_75)
    assert (rows[1].money_in_cents, rows[1].money_out_cents) == (0, 0)
    assert rows[2].net_cents == -10_00
    assert (totals.money_in_cents, totals.money_out_cents, totals.net_cents) == (1000_00, 260_25, 739_75)
