"""Raid dates a week (or N days) on — the slot math, pure (``now`` is passed in).

A slot is a day at a wall-clock time in a timezone, so a raid at 8:00pm stays
at 8:00pm across a DST change.  Days are counted on the local calendar: no
drift.  A time a spring-forward gap skips lands an hour later (2:30am →
3:30am), and in the repeated fall-back hour the first one counts, as in
``parse_raid_time``; the gap doesn't drag the slots after it.

Copy raid suggests the raid's time a week on, rolled weekly into the future
when the raid is older than that (Raid-Helper's ``/copy event`` moves it
+7 days).
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Final
from zoneinfo import ZoneInfo

WEEK: Final = 7


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
