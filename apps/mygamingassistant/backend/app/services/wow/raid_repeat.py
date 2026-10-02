"""Raid dates a week (or N days) on, and a repeat's rules — pure (``now`` is passed in).

A slot is a day at a wall-clock time in a timezone, so a raid at 8:00pm stays
at 8:00pm across a DST change.  Days are counted on the local calendar: no
drift.  A time a spring-forward gap skips lands an hour later (2:30am →
3:30am), and in the repeated fall-back hour the first one counts, as in
``parse_raid_time``; the gap doesn't drag the slots after it.

Copy raid suggests the raid's time a week on, rolled weekly into the future
when the raid is older than that (Raid-Helper's ``/copy event`` moves it
+7 days).

A repeat (``wow_raid_series``) posts a raid every ``every_days`` days,
``post_ahead_hours`` before its start, or one interval before when that's
null ("when the one before starts").  Never further ahead than the
interval, so at most one raid waits ahead.  A raid that would post with
sign-ups already closed by its deadline is a conflict.
"""
from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Final
from zoneinfo import ZoneInfo

from app.models.wow.wow_raid_series import WowRaidSeries
from app.services.wow.raid_deadline import deadline_words

WEEK: Final = 7
DAY_HOURS: Final = 24
MAX_EVERY_DAYS: Final = 28
# How often? — the menu's choices in days: weekly 40-mans, every other week,
# and Classic's ZG / AQ20 (3 days) and Onyxia (5 days) resets.
CADENCES: Final = (7, 14, 3, 5)
# When should I post each one? — in hours before the start; None = when the one before starts.
AHEADS: Final = (None, 24, 48, 72, 168, 336)
_DAYS: Final = re.compile(r"[0-9]{1,2}")


class RepeatError(ValueError):
    """A typed number of days that can't be used: ``format`` (not a number) or ``range`` (not 1–28)."""

    def __init__(self, kind: str) -> None:
        super().__init__(kind)
        self.kind = kind


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------


def slot_at(day: date, start_local: time, tz_name: str) -> datetime:
    """*day* at *start_local* in *tz_name*, as UTC.  fold=0: a gap time an hour later, a fall-back time the first."""
    local = datetime.combine(day, start_local.replace(tzinfo=None, fold=0), tzinfo=ZoneInfo(tz_name))
    return local.astimezone(timezone.utc)


def local_clock(moment: datetime, tz_name: str) -> time:
    """*moment*'s wall-clock time in *tz_name*."""
    return moment.astimezone(ZoneInfo(tz_name)).time().replace(fold=0)


def following(slot: datetime, every_days: int, start_local: time, tz_name: str) -> datetime:
    """The slot *every_days* local days after *slot*'s day, at *start_local*."""
    day = slot.astimezone(ZoneInfo(tz_name)).date() + timedelta(days=every_days)
    return slot_at(day, start_local, tz_name)


def first_after(anchor: datetime, every_days: int, start_local: time, tz_name: str, now: datetime) -> datetime:
    """The first slot after *anchor*, every *every_days* days, that's later than *now*.

    The slots already past are skipped, never posted.  It jumps to about
    *now* first, so an old anchor costs no more than a recent one.
    """
    start = anchor.astimezone(ZoneInfo(tz_name)).date()
    behind = (now.astimezone(ZoneInfo(tz_name)).date() - start).days
    day = start + timedelta(days=max(1, behind // every_days) * every_days)
    slot = slot_at(day, start_local, tz_name)
    while slot <= now:
        slot = following(slot, every_days, start_local, tz_name)
    return slot


def copy_suggestion(source_starts_at: datetime, tz_name: str, now: datetime) -> datetime:
    """Copy raid's suggested start: a week after the raid at its time, rolled weekly into the future."""
    return first_after(source_starts_at, WEEK, local_clock(source_starts_at, tz_name), tz_name, now)


def rebase(series: WowRaidSeries, every_days: int, now: datetime) -> datetime:
    """The next slot once the repeat is every *every_days* days: on from the slot before its next one.

    The slot before is the next one less the old interval, at the repeat's
    own time of day: a raid moved on its own doesn't move the repeat.
    """
    before = series.next_starts_at.astimezone(ZoneInfo(series.tz_name)).date() - timedelta(days=series.every_days)
    anchor = slot_at(before, series.start_local, series.tz_name)
    return first_after(anchor, every_days, series.start_local, series.tz_name, now)


# ---------------------------------------------------------------------------
# Posting ahead
# ---------------------------------------------------------------------------


def ahead_or_interval(hours: int | None, every_days: int) -> int:
    """How long before its start a raid posts, in hours: *hours*, or one interval when that's None."""
    if hours is None:
        return every_days * DAY_HOURS
    return hours


def ahead_hours(series: WowRaidSeries) -> int:
    """How long before its start each of the repeat's raids posts, in hours."""
    return ahead_or_interval(series.post_ahead_hours, series.every_days)


def post_at(series: WowRaidSeries) -> datetime:
    """When the repeat's next raid posts."""
    return series.next_starts_at - timedelta(hours=ahead_hours(series))


def ahead_fits(hours: int | None, every_days: int) -> bool:
    """Whether posting *hours* ahead stays within the interval: at most one raid waits ahead."""
    return hours is None or hours <= every_days * DAY_HOURS


def ahead_choices(every_days: int) -> tuple[int | None, ...]:
    """The post-ahead menu's choices for a repeat every *every_days* days: none longer than the interval."""
    return tuple(hours for hours in AHEADS if ahead_fits(hours, every_days))


def ahead_conflict(hours: int, deadline_minutes: int | None) -> bool:
    """Whether a raid posted *hours* ahead would post with sign-ups already closed (equal counts)."""
    return deadline_minutes is not None and hours * 60 <= deadline_minutes


def closed_by_then(starts_at: datetime, deadline_minutes: int | None, now: datetime) -> bool:
    """Whether sign-ups to a raid at *starts_at* would already be closed by its deadline at *now*."""
    return deadline_minutes is not None and starts_at - timedelta(minutes=deadline_minutes) <= now


# ---------------------------------------------------------------------------
# Reading and words
# ---------------------------------------------------------------------------


def parse_every(text: str) -> int:
    """A typed number of days between raids: 1–28."""
    cleaned = text.strip()
    if not _DAYS.fullmatch(cleaned):
        raise RepeatError("format")
    days = int(cleaned)
    if not 1 <= days <= MAX_EVERY_DAYS:
        raise RepeatError("range")
    return days


def every_words(days: int) -> str:
    """'every day', 'every week', 'every 2 weeks', 'every 3 days'."""
    if days == 1:
        return "every day"
    weeks, rest = divmod(days, WEEK)
    if rest:
        return f"every {days} days"
    if weeks == 1:
        return "every week"
    return f"every {weeks} weeks"


def span_words(hours: int) -> str:
    """'1 week', '2 weeks', '3 days', '1 day 12 hours'."""
    weeks, rest = divmod(hours, WEEK * DAY_HOURS)
    if rest or not weeks:
        return deadline_words(hours * 60)
    if weeks == 1:
        return "1 week"
    return f"{weeks} weeks"


def ahead_words(hours: int | None) -> str:
    """'when the one before starts', '1 day before', '2 weeks before'."""
    if hours is None:
        return "when the one before starts"
    return f"{span_words(hours)} before"


def day_words(slot: datetime, tz_name: str) -> str:
    """'Tue, Oct 13' in *tz_name*: for labels, which can't hold Discord's timestamps."""
    local = slot.astimezone(ZoneInfo(tz_name))
    return f"{local:%a}, {local:%b} {local.day}"


def slot_words(slot: datetime, tz_name: str) -> str:
    """'Tue, Oct 13 8:00pm' in *tz_name*."""
    local = slot.astimezone(ZoneInfo(tz_name))
    clock = f"{local.hour % 12 or 12}:{local:%M}{local:%p}".lower()
    return f"{day_words(slot, tz_name)} {clock}"


def skip_label(slot: datetime, tz_name: str) -> str:
    """The Skip button's label: 'Skip Tue, Oct 13'."""
    return f"Skip {day_words(slot, tz_name)}"
