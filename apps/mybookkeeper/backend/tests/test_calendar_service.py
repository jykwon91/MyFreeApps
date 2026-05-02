"""Service tests for calendar window resolution.

Pure unit tests on ``_resolve_window`` — no DB. Verifies:
- both omitted → today → today + DEFAULT_WINDOW_DAYS
- partial supply (only from / only to) → fills the missing side
- inverted ranges raise CalendarWindowError
- window > MAX_WINDOW_DAYS raises CalendarWindowError
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.core.calendar_constants import DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS
from app.services.calendar import calendar_service
from app.services.calendar.calendar_service import CalendarWindowError, _resolve_window


class TestCalendarServiceWindow:
    def test_both_omitted_defaults_to_today_plus_window(self) -> None:
        from_, to = _resolve_window(None, None)
        assert from_ == date.today()
        assert (to - from_).days == DEFAULT_WINDOW_DAYS

    def test_only_to_supplied_fills_from(self) -> None:
        explicit_to = date(2026, 12, 31)
        from_, to = _resolve_window(None, explicit_to)
        assert to == explicit_to
        assert (explicit_to - from_).days == DEFAULT_WINDOW_DAYS

    def test_only_from_supplied_fills_to(self) -> None:
        explicit_from = date(2026, 6, 1)
        from_, to = _resolve_window(explicit_from, None)
        assert from_ == explicit_from
        assert (to - explicit_from).days == DEFAULT_WINDOW_DAYS

    def test_both_supplied_passthrough(self) -> None:
        f, t = date(2026, 6, 1), date(2026, 6, 30)
        from_, to = _resolve_window(f, t)
        assert from_ == f
        assert to == t

    def test_inverted_range_raises(self) -> None:
        with pytest.raises(CalendarWindowError):
            _resolve_window(date(2026, 7, 1), date(2026, 6, 1))

    def test_zero_day_window_raises(self) -> None:
        with pytest.raises(CalendarWindowError):
            _resolve_window(date(2026, 7, 1), date(2026, 7, 1))

    def test_window_exactly_at_cap_succeeds(self) -> None:
        f = date(2026, 1, 1)
        t = f + timedelta(days=MAX_WINDOW_DAYS)
        from_, to = _resolve_window(f, t)
        assert (to - from_).days == MAX_WINDOW_DAYS

    def test_window_above_cap_raises(self) -> None:
        f = date(2026, 1, 1)
        t = f + timedelta(days=MAX_WINDOW_DAYS + 1)
        with pytest.raises(CalendarWindowError):
            _resolve_window(f, t)


# Smoke check: re-export sanity (the service is the public interface).
def test_service_exports_window_error() -> None:
    assert calendar_service.CalendarWindowError is CalendarWindowError
