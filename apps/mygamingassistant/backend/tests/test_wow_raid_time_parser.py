"""Unit tests for app.services.wow.raid_time_parser (pure, no DB).

Reference clock: Thursday 2026-10-01 18:00 America/New_York (EDT, UTC-4).
"""
from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from app.services.wow.raid_time_parser import (
    PAST_MESSAGE,
    UNREADABLE_MESSAGE,
    NonexistentLocalTimeError,
    TimeInPastError,
    UnreadableTimeError,
    parse_raid_time,
)

NY = "America/New_York"
_NY = ZoneInfo(NY)
NOW = datetime(2026, 10, 1, 18, 0, tzinfo=_NY).astimezone(timezone.utc)  # Thursday


def _ny(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=_NY).astimezone(timezone.utc)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("sat 8pm", _ny(2026, 10, 3, 20)),
        ("Saturday 20:00", _ny(2026, 10, 3, 20)),
        ("sat at 8 PM", _ny(2026, 10, 3, 20)),
        ("sat @ 8pm", _ny(2026, 10, 3, 20)),
        ("tomorrow 7:30pm", _ny(2026, 10, 2, 19, 30)),
        ("today 9pm", _ny(2026, 10, 1, 21)),
        ("tonight 9:15 pm", _ny(2026, 10, 1, 21, 15)),
        ("10/14 8pm", _ny(2026, 10, 14, 20)),
        ("10/14/2026 8:00pm", _ny(2026, 10, 14, 20)),
        ("10/14/26 8pm", _ny(2026, 10, 14, 20)),
        ("2026-10-14 20:00", _ny(2026, 10, 14, 20)),
        ("sat 12am", _ny(2026, 10, 3, 0)),
        ("sat 12pm", _ny(2026, 10, 3, 12)),
        ("sat 09:00", _ny(2026, 10, 3, 9)),
        ("sat 0:30", _ny(2026, 10, 3, 0, 30)),
        ("  SAT,   8pm ", _ny(2026, 10, 3, 20)),
        ("sat 8p", _ny(2026, 10, 3, 20)),
    ],
)
def test_accepted_formats(text: str, expected: datetime) -> None:
    result = parse_raid_time(text, tz_name=NY, now=NOW)
    assert result == expected
    assert result.tzinfo == timezone.utc


def test_bare_weekday_today_with_time_ahead_means_today() -> None:
    assert parse_raid_time("thu 9pm", tz_name=NY, now=NOW) == _ny(2026, 10, 1, 21)


def test_bare_weekday_today_with_time_passed_means_next_week() -> None:
    assert parse_raid_time("thursday 5pm", tz_name=NY, now=NOW) == _ny(2026, 10, 8, 17)


def test_bare_weekday_earlier_in_week_rolls_forward() -> None:
    assert parse_raid_time("mon 8pm", tz_name=NY, now=NOW) == _ny(2026, 10, 5, 20)


def test_month_day_already_past_this_year_rolls_to_next_year() -> None:
    assert parse_raid_time("9/1 8pm", tz_name=NY, now=NOW) == _ny(2027, 9, 1, 20)


def test_explicit_past_date_is_rejected_with_spec_copy() -> None:
    with pytest.raises(TimeInPastError) as exc_info:
        parse_raid_time("10/1/2025 8pm", tz_name=NY, now=NOW)
    assert exc_info.value.user_message == PAST_MESSAGE


def test_today_time_already_passed_is_rejected() -> None:
    with pytest.raises(TimeInPastError):
        parse_raid_time("today 5pm", tz_name=NY, now=NOW)


@pytest.mark.parametrize(
    "text",
    [
        "",
        "sat",
        "8pm",
        "sat 8",  # no am/pm, no colon
        "sat 8:00",  # ambiguous 12-hour clock without am/pm
        "sat 13pm",
        "sat 8:75pm",
        "sat 25:00",
        "2/30 8pm",
        "someday 8pm",
        "next sat 8pm",
        "10/14",
        "2026-13-01 20:00",
    ],
)
def test_unreadable_inputs(text: str) -> None:
    with pytest.raises(UnreadableTimeError) as exc_info:
        parse_raid_time(text, tz_name=NY, now=NOW)
    assert exc_info.value.user_message == UNREADABLE_MESSAGE


def test_spring_forward_gap_is_rejected() -> None:
    # 2027-03-14 02:30 does not exist in New York (02:00 → 03:00).
    with pytest.raises(NonexistentLocalTimeError) as exc_info:
        parse_raid_time("3/14/2027 2:30am", tz_name=NY, now=NOW)
    assert NY in exc_info.value.user_message


def test_fall_back_repeated_hour_resolves_to_first_occurrence() -> None:
    # 2026-11-01 01:30 happens twice; the first is EDT (UTC-4) → 05:30 UTC.
    result = parse_raid_time("11/1 1:30am", tz_name=NY, now=NOW)
    assert result == datetime(2026, 11, 1, 5, 30, tzinfo=timezone.utc)


def test_weekday_across_dst_change_uses_the_new_offset() -> None:
    saturday_noon = datetime(2026, 10, 31, 12, 0, tzinfo=_NY).astimezone(timezone.utc)
    # Sunday Nov 1 is after the fall-back: 20:00 EST = 01:00 UTC Monday.
    result = parse_raid_time("sun 8pm", tz_name=NY, now=saturday_noon)
    assert result == datetime(2026, 11, 2, 1, 0, tzinfo=timezone.utc)


def test_other_timezone() -> None:
    result = parse_raid_time("sat 20:00", tz_name="Europe/London", now=NOW)
    assert result == datetime(2026, 10, 3, 19, 0, tzinfo=timezone.utc)  # BST = UTC+1


def test_weekday_resolution_uses_guild_local_date_not_utc() -> None:
    # 22:30 Thursday in New York is already Friday in UTC — "fri" is tomorrow locally.
    late_thursday = datetime(2026, 10, 1, 22, 30, tzinfo=_NY).astimezone(timezone.utc)
    assert parse_raid_time("fri 8pm", tz_name=NY, now=late_thursday) == _ny(2026, 10, 2, 20)
