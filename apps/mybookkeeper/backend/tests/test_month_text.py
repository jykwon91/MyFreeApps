"""Months on the wire ("YYYY-MM") and as first-of-month dates."""
from __future__ import annotations

import datetime as _dt

import pytest

from app.core.month_text import add_months, format_month, month_end, month_start, parse_month


def test_parses_a_month_to_its_first_day() -> None:
    assert parse_month("2026-02") == _dt.date(2026, 2, 1)


@pytest.mark.parametrize(
    "text", ["2026-13", "2026-00", "2026-2", "26-02", "2026-02-01", "1999-12", "2100-01", "", "abcd-ef"],
)
def test_refuses_anything_but_a_real_supported_month(text: str) -> None:
    with pytest.raises(ValueError):
        parse_month(text)


def test_formats_back_to_the_same_text() -> None:
    assert format_month(_dt.date(2026, 3, 1)) == "2026-03"


def test_month_arithmetic_crosses_years() -> None:
    assert add_months(_dt.date(2026, 1, 1), -1) == _dt.date(2025, 12, 1)
    assert add_months(_dt.date(2025, 11, 1), 3) == _dt.date(2026, 2, 1)
    assert month_start(_dt.date(2026, 5, 19)) == _dt.date(2026, 5, 1)


def test_month_end_handles_february_and_december() -> None:
    assert month_end(_dt.date(2028, 2, 1)) == _dt.date(2028, 2, 29)
    assert month_end(_dt.date(2026, 12, 10)) == _dt.date(2026, 12, 31)
