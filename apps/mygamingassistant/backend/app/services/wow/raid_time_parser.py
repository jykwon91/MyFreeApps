"""Parse an organiser's free-text raid time in the guild's timezone.

Pure, stdlib-only (``zoneinfo``).  Accepted shapes (case-insensitive,
optional "at"/"@" between date and time, commas ignored)::

    sat 8pm            saturday 20:00       tomorrow 7:30pm     today 9 pm
    10/14 8pm          10/14/2026 8:00pm    2026-10-14 20:00

Rules
-----
* A **bare weekday** means its next occurrence.  If it's today and the time
  is still ahead, it means today; if the time has passed, next week.
* ``m/d`` without a year means this year, rolling to next year when the date
  is already behind us (so "1/5" typed in December means January).
* Times need an am/pm marker **or** an unambiguous 24-hour clock
  (``20:00``, ``09:00``, ``0:30``).  ``8:00`` / ``8`` alone are rejected
  as ambiguous — a raid at 8 AM is a typo far more often than intent.
* A local time that falls in a DST spring-forward gap does not exist and is
  rejected; a repeated (fall-back) time resolves to its first occurrence.

Returns an aware UTC ``datetime`` or raises a :class:`RaidTimeError`
subclass whose ``user_message`` is ready to show in Discord.
"""
from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Final
from zoneinfo import ZoneInfo

UNREADABLE_MESSAGE: Final = "I couldn't read that. Try `sat 8pm` or `10/14 8:00pm`."
PAST_MESSAGE: Final = "That time has already passed. Try a future time, like `sat 8pm`."

_WEEKDAYS: Final[dict[str, int]] = {
    "mon": 0, "monday": 0,
    "tue": 1, "tues": 1, "tuesday": 1,
    "wed": 2, "weds": 2, "wednesday": 2,
    "thu": 3, "thur": 3, "thurs": 3, "thursday": 3,
    "fri": 4, "friday": 4,
    "sat": 5, "saturday": 5,
    "sun": 6, "sunday": 6,
}

_TIME_RE: Final = re.compile(
    r"(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<meridiem>am|pm|a|p)?$"
)
_US_DATE_RE: Final = re.compile(r"(?P<month>\d{1,2})/(?P<day>\d{1,2})(?:/(?P<year>\d{2}|\d{4}))?$")
_ISO_DATE_RE: Final = re.compile(r"(?P<year>\d{4})-(?P<month>\d{1,2})-(?P<day>\d{1,2})$")
_JOINERS: Final = (" at ", " @ ")


class RaidTimeError(ValueError):
    """Base class — ``user_message`` is safe to show in Discord verbatim."""

    def __init__(self, user_message: str) -> None:
        super().__init__(user_message)
        self.user_message = user_message


class UnreadableTimeError(RaidTimeError):
    def __init__(self) -> None:
        super().__init__(UNREADABLE_MESSAGE)


class TimeInPastError(RaidTimeError):
    def __init__(self) -> None:
        super().__init__(PAST_MESSAGE)


class NonexistentLocalTimeError(RaidTimeError):
    def __init__(self, tz_name: str) -> None:
        super().__init__(
            f"That time doesn't exist in {tz_name} because the clocks jump forward "
            "that night. Try a different time."
        )


def parse_raid_time(text: str, *, tz_name: str, now: datetime) -> datetime:
    """Parse ``text`` in ``tz_name`` relative to ``now`` (aware).  Returns aware UTC."""
    tz = ZoneInfo(tz_name)
    local_now = now.astimezone(tz)

    date_text, clock = _split(text)
    if clock is None:
        raise UnreadableTimeError()

    candidate = _resolve(date_text, clock, tz=tz, local_now=local_now)
    _require_exists(candidate, tz_name)
    result = candidate.astimezone(timezone.utc)
    if result <= now:
        raise TimeInPastError()
    return result


def _split(text: str) -> tuple[str, time | None]:
    normalized = " ".join(text.lower().replace(",", " ").split())
    padded = f" {normalized} "
    for joiner in _JOINERS:
        padded = padded.replace(joiner, " ")
    normalized = padded.strip()

    # Try progressively shorter tails as the time component: "7:30 pm" is two
    # tokens, "7:30pm" one.
    tokens = normalized.split(" ")
    for tail_len in (2, 1):
        if len(tokens) <= tail_len:
            continue
        clock = _parse_clock(" ".join(tokens[-tail_len:]))
        if clock is not None:
            return " ".join(tokens[:-tail_len]), clock
    return normalized, None


def _parse_clock(text: str) -> time | None:
    match = _TIME_RE.fullmatch(text)
    if match is None:
        return None
    hour = int(match["hour"])
    minute = int(match["minute"] or 0)
    if minute > 59:
        return None
    meridiem = match["meridiem"]
    if meridiem is not None:
        if not 1 <= hour <= 12:
            return None
        if meridiem.startswith("p") and hour != 12:
            hour += 12
        elif meridiem.startswith("a") and hour == 12:
            hour = 0
        return time(hour, minute)
    # No am/pm: only an unambiguous 24-hour clock is accepted.
    if match["minute"] is None or hour > 23:
        return None
    is_unambiguous = hour >= 13 or hour == 0 or match["hour"].startswith("0")
    if not is_unambiguous:
        return None
    return time(hour, minute)


def _resolve(date_text: str, clock: time, *, tz: ZoneInfo, local_now: datetime) -> datetime:
    today = local_now.date()

    if date_text in ("today", "tonight"):
        return _combine(today, clock, tz)
    if date_text == "tomorrow":
        return _combine(today + timedelta(days=1), clock, tz)

    if date_text in _WEEKDAYS:
        delta = (_WEEKDAYS[date_text] - today.weekday()) % 7
        candidate = _combine(today + timedelta(days=delta), clock, tz)
        if candidate <= local_now:
            candidate = _combine(today + timedelta(days=delta or 7), clock, tz)
        return candidate

    us_match = _US_DATE_RE.fullmatch(date_text)
    if us_match is not None:
        month = int(us_match["month"])
        day = int(us_match["day"])
        if us_match["year"] is not None:
            year = int(us_match["year"])
            if year < 100:
                year += 2000
            return _combine(_safe_date(year, month, day), clock, tz)
        target = _safe_date(today.year, month, day)
        if target < today:
            target = _safe_date(today.year + 1, month, day)
        return _combine(target, clock, tz)

    iso_match = _ISO_DATE_RE.fullmatch(date_text)
    if iso_match is not None:
        target = _safe_date(int(iso_match["year"]), int(iso_match["month"]), int(iso_match["day"]))
        return _combine(target, clock, tz)

    raise UnreadableTimeError()


def _safe_date(year: int, month: int, day: int) -> date:
    try:
        return date(year, month, day)
    except ValueError as exc:
        raise UnreadableTimeError() from exc


def _combine(day: date, clock: time, tz: ZoneInfo) -> datetime:
    # fold=0 → for a repeated fall-back hour, the first (daylight) occurrence.
    return datetime.combine(day, clock, tzinfo=tz)


def _require_exists(local: datetime, tz_name: str) -> None:
    """Reject wall-clock times that fall in a DST spring-forward gap."""
    round_trip = local.astimezone(timezone.utc).astimezone(local.tzinfo)
    if round_trip.replace(tzinfo=None) != local.replace(tzinfo=None):
        raise NonexistentLocalTimeError(tz_name)
