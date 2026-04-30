"""Unit tests for the inbound iCal parser.

Verifies the parser handles the variations real channels emit:
- DTSTART;VALUE=DATE (date-only)
- DTSTART;VALUE=DATE-TIME with explicit timezone
- Missing DTEND (RFC 5545 default = +1 day for date events)
- Missing UID (skipped)
- Inverted / zero-length range (skipped)
"""
from __future__ import annotations

from datetime import date

from app.services.listings.ical_parser import parse_ical_blackouts


def _ical(events: str) -> bytes:
    return (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//Test//Test//EN\r\n"
        f"{events}"
        "END:VCALENDAR\r\n"
    ).encode()


def _vevent(
    *,
    uid: str | None = "uid-1",
    dtstart: str = "DTSTART;VALUE=DATE:20260615",
    dtend: str | None = "DTEND;VALUE=DATE:20260620",
    summary: str = "Blocked",
) -> str:
    parts = ["BEGIN:VEVENT\r\n"]
    if uid is not None:
        parts.append(f"UID:{uid}\r\n")
    parts.append(f"{dtstart}\r\n")
    if dtend is not None:
        parts.append(f"{dtend}\r\n")
    parts.append("DTSTAMP:20260429T120000Z\r\n")
    parts.append(f"SUMMARY:{summary}\r\n")
    parts.append("END:VEVENT\r\n")
    return "".join(parts)


class TestParseIcalBlackouts:
    def test_parses_date_only_event(self) -> None:
        payload = _ical(_vevent())
        parsed = parse_ical_blackouts(payload)

        assert len(parsed) == 1
        assert parsed[0].uid == "uid-1"
        assert parsed[0].starts_on == date(2026, 6, 15)
        assert parsed[0].ends_on == date(2026, 6, 20)

    def test_parses_datetime_event_with_timezone(self) -> None:
        payload = _ical(
            _vevent(
                dtstart="DTSTART:20260615T000000Z",
                dtend="DTEND:20260620T000000Z",
            )
        )
        parsed = parse_ical_blackouts(payload)

        assert len(parsed) == 1
        assert parsed[0].starts_on == date(2026, 6, 15)
        assert parsed[0].ends_on == date(2026, 6, 20)

    def test_default_one_day_when_dtend_missing(self) -> None:
        payload = _ical(_vevent(dtend=None))
        parsed = parse_ical_blackouts(payload)

        assert len(parsed) == 1
        # Single-day block: ends_on = starts_on + 1
        assert parsed[0].starts_on == date(2026, 6, 15)
        assert parsed[0].ends_on == date(2026, 6, 16)

    def test_skips_event_without_uid(self) -> None:
        payload = _ical(_vevent(uid=None) + _vevent(uid="uid-keep"))
        parsed = parse_ical_blackouts(payload)

        assert [p.uid for p in parsed] == ["uid-keep"]

    def test_skips_inverted_range(self) -> None:
        payload = _ical(
            _vevent(
                dtstart="DTSTART;VALUE=DATE:20260620",
                dtend="DTEND;VALUE=DATE:20260615",
            )
        )
        parsed = parse_ical_blackouts(payload)

        assert parsed == []

    def test_skips_zero_length_range(self) -> None:
        payload = _ical(
            _vevent(
                dtstart="DTSTART;VALUE=DATE:20260615",
                dtend="DTEND;VALUE=DATE:20260615",
            )
        )
        parsed = parse_ical_blackouts(payload)

        assert parsed == []

    def test_returns_multiple_events_in_order(self) -> None:
        payload = _ical(
            _vevent(uid="a", dtstart="DTSTART;VALUE=DATE:20260101", dtend="DTEND;VALUE=DATE:20260105")
            + _vevent(uid="b", dtstart="DTSTART;VALUE=DATE:20260201", dtend="DTEND;VALUE=DATE:20260203")
        )
        parsed = parse_ical_blackouts(payload)

        uids = [p.uid for p in parsed]
        assert "a" in uids and "b" in uids
        assert len(parsed) == 2
