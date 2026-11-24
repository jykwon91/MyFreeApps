"""Months as "YYYY-MM" text on the wire and as first-of-month dates inside. Pure."""
from __future__ import annotations

import datetime as _dt
import re

from app.core.budget_constants import MONTH_FORMAT_PATTERN, MONTH_MAX_YEAR, MONTH_MIN_YEAR

_MONTH_RE = re.compile(MONTH_FORMAT_PATTERN)


def parse_month(text: str) -> _dt.date:
    """The first day of the month ``text`` names. Raises ``ValueError`` on
    anything but a real "YYYY-MM" inside the supported years."""
    if not _MONTH_RE.match(text):
        raise ValueError(f"Expected a month as YYYY-MM, got {text!r}")
    year, month = int(text[:4]), int(text[5:])
    if not MONTH_MIN_YEAR <= year <= MONTH_MAX_YEAR or not 1 <= month <= 12:
        raise ValueError(f"No such month: {text!r}")
    return _dt.date(year, month, 1)


def format_month(month: _dt.date) -> str:
    return f"{month.year:04d}-{month.month:02d}"


def month_start(day: _dt.date) -> _dt.date:
    return day.replace(day=1)


def add_months(month: _dt.date, count: int) -> _dt.date:
    """The first of the month ``count`` months after ``month`` (negative goes back)."""
    index = month.year * 12 + month.month - 1 + count
    return _dt.date(index // 12, index % 12 + 1, 1)


def month_end(month: _dt.date) -> _dt.date:
    """The last day of ``month``'s month."""
    return add_months(month_start(month), 1) - _dt.timedelta(days=1)
