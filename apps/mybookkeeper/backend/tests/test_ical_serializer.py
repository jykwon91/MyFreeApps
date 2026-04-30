"""Unit tests for the outbound iCal serializer.

Pure function tests — no DB. Verifies the produced bytes are a
parseable iCalendar payload with the expected VEVENTs.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from icalendar import Calendar

from app.models.listings.listing_blackout import ListingBlackout
from app.services.listings.ical_serializer import serialize_blackouts


def _blackout(starts: date, ends: date, *, blackout_id: uuid.UUID | None = None) -> ListingBlackout:
    row = ListingBlackout(
        id=blackout_id or uuid.uuid4(),
        listing_id=uuid.uuid4(),
        starts_on=starts,
        ends_on=ends,
        source="manual",
    )
    return row


class TestSerializeBlackouts:
    def test_emits_valid_ical_with_one_event(self) -> None:
        blackout_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
        rows = [_blackout(date(2026, 6, 15), date(2026, 6, 20), blackout_id=blackout_id)]

        payload = serialize_blackouts(
            "listing-1234", rows, now=datetime(2026, 4, 30, 1, 0, 0, tzinfo=timezone.utc),
        )

        cal = Calendar.from_ical(payload)
        assert "MyBookkeeper" in str(cal.get("prodid"))

        events = list(cal.walk("vevent"))
        assert len(events) == 1
        e = events[0]
        assert "blackout-11111111-1111-1111-1111-111111111111@mybookkeeper" == str(e.get("uid"))
        assert e.get("dtstart").dt == date(2026, 6, 15)
        assert e.get("dtend").dt == date(2026, 6, 20)
        assert "Blocked" == str(e.get("summary"))

    def test_emits_empty_calendar_when_no_blackouts(self) -> None:
        payload = serialize_blackouts("listing-empty", [])

        cal = Calendar.from_ical(payload)
        events = list(cal.walk("vevent"))
        assert events == []
        # Even an empty calendar must declare PRODID + VERSION + CALSCALE.
        assert cal.get("version") is not None
        assert cal.get("calscale") is not None

    def test_emits_one_vevent_per_blackout(self) -> None:
        rows = [
            _blackout(date(2026, 1, 1), date(2026, 1, 5)),
            _blackout(date(2026, 2, 10), date(2026, 2, 12)),
            _blackout(date(2026, 3, 20), date(2026, 3, 21)),
        ]
        payload = serialize_blackouts("listing-multi", rows)

        cal = Calendar.from_ical(payload)
        events = list(cal.walk("vevent"))
        assert len(events) == 3

    def test_dtstamp_is_now_in_utc(self) -> None:
        rows = [_blackout(date(2026, 6, 15), date(2026, 6, 20))]
        stamp = datetime(2026, 4, 29, 12, 0, 0, tzinfo=timezone.utc)
        payload = serialize_blackouts("listing-stamp", rows, now=stamp)

        cal = Calendar.from_ical(payload)
        events = list(cal.walk("vevent"))
        # ``icalendar`` returns dtstamp as a vDDDTypes wrapper around a
        # datetime; either equality form works.
        dt = events[0].get("dtstamp").dt
        # Compare as UTC-tz-aware.
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        assert dt == stamp
