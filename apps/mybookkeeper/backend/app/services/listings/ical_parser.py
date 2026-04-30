"""Pure iCal parser for inbound channel feeds.

Reads an iCal payload and returns a list of normalised ``ParsedBlackout``
records. Designed to be tolerant of the small variations real channels
emit:

- Date-only events use ``DTSTART;VALUE=DATE`` and ``DTEND;VALUE=DATE``
  (``date`` python type).
- Some channels emit datetime-typed start/end even for whole-day blocks.
  We coerce to ``date`` by taking the date portion in UTC.
- DTEND may be missing — RFC 5545 says a missing DTEND on a DATE event
  defaults to a 1-day duration. We replicate that.
- A VEVENT without a UID is skipped — without a stable identifier we
  cannot dedup on re-poll.

Errors propagate to the caller (the polling worker) which catches and
records them in ``channel_listing.last_import_error`` without dropping
existing blackout rows.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from icalendar import Calendar


@dataclass(frozen=True)
class ParsedBlackout:
    """One blackout entry parsed from an inbound iCal feed."""
    uid: str
    starts_on: date
    ends_on: date


def _to_date(value: object) -> date:
    """Coerce an iCal-typed start/end value to a UTC ``date``."""
    if isinstance(value, datetime):
        # If the datetime carries a timezone, convert to UTC then take
        # the date — preserves the operator's intent ("the 15th") across
        # tz boundaries.
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).date()
        return value.date()
    if isinstance(value, date):
        return value
    raise ValueError(f"Unsupported DTSTART/DTEND value: {value!r}")


def parse_ical_blackouts(payload: bytes) -> list[ParsedBlackout]:
    """Parse iCal bytes into a list of (uid, starts_on, ends_on) records.

    Skips VEVENTs without a UID. Treats missing DTEND on a date-typed
    event as ``starts_on + 1 day`` (RFC 5545 default). Drops events whose
    computed range is empty or inverted (``ends_on <= starts_on``) — the
    polling worker logs the count of dropped events for the host's
    diagnostics in a future PR.
    """
    cal = Calendar.from_ical(payload)
    parsed: list[ParsedBlackout] = []

    for component in cal.walk("vevent"):
        uid_field = component.get("uid")
        if uid_field is None:
            continue
        uid = str(uid_field)

        dtstart = component.get("dtstart")
        if dtstart is None:
            continue
        starts_on = _to_date(dtstart.dt)

        dtend = component.get("dtend")
        if dtend is None:
            # RFC 5545: a date-only event with no DTEND is one day long.
            ends_on = starts_on + timedelta(days=1)
        else:
            ends_on = _to_date(dtend.dt)

        if ends_on <= starts_on:
            continue

        parsed.append(
            ParsedBlackout(uid=uid, starts_on=starts_on, ends_on=ends_on),
        )

    return parsed
