"""Integration tests for the unauthenticated outbound iCal endpoint.

Verifies:
- Invalid token returns 404 (no existence leak)
- Valid token returns parseable iCal with the expected VEVENTs
- Content-Type is text/calendar
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from icalendar import Calendar

from app.main import app


class TestCalendarRoute:
    def test_invalid_token_returns_404(self) -> None:
        # No mock — render_ical_for_token resolves a real DB lookup,
        # which TestClient cannot satisfy. We patch it to None to
        # simulate "token not found" without real DB access.
        with patch(
            "app.api.calendar.render_ical_for_token", return_value=None,
        ):
            client = TestClient(app)
            response = client.get("/calendar/definitely-not-real.ics")
        assert response.status_code == 404

    def test_valid_token_returns_parseable_ical(self) -> None:
        # Hand-crafted VCALENDAR for the patched return.
        payload = (
            b"BEGIN:VCALENDAR\r\n"
            b"VERSION:2.0\r\n"
            b"PRODID:-//MyBookkeeper//listing test//EN\r\n"
            b"CALSCALE:GREGORIAN\r\n"
            b"BEGIN:VEVENT\r\n"
            b"UID:blackout-1@mybookkeeper\r\n"
            b"DTSTAMP:20260429T120000Z\r\n"
            b"SUMMARY:Blocked\r\n"
            b"DTSTART;VALUE=DATE:20260615\r\n"
            b"DTEND;VALUE=DATE:20260620\r\n"
            b"END:VEVENT\r\n"
            b"END:VCALENDAR\r\n"
        )
        with patch(
            "app.api.calendar.render_ical_for_token", return_value=payload,
        ):
            client = TestClient(app)
            response = client.get("/calendar/some-token.ics")

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/calendar")

        # The body parses cleanly as iCalendar.
        cal = Calendar.from_ical(response.content)
        events = list(cal.walk("vevent"))
        assert len(events) == 1
        assert "MyBookkeeper" in str(cal.get("prodid"))
