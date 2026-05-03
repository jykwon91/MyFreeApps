"""Unit tests for the booking email parser.

Covers:
- Parser correctness for each supported channel using fixture samples.
- Channel detection (positive and negative cases).
- Date range extraction from subject line.
- Price extraction.
- is_booking=False for non-booking emails.
- ``to_payload`` serialisation.
"""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path

import pytest

from app.services.email.booking_parser import (
    BookingParseResult,
    parse_booking_email,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "email_samples"


def _load_fixture(filename: str) -> tuple[str, str]:
    """Load subject and body from a fixture file.

    Fixture format: first line is ``Subject: …``, second is ``From: …``,
    rest is body.
    """
    text = (FIXTURES_DIR / filename).read_text()
    lines = text.splitlines()
    subject = ""
    from_address = ""
    body_start = 0
    for i, line in enumerate(lines):
        if line.startswith("Subject:"):
            subject = line[len("Subject:"):].strip()
        elif line.startswith("From:"):
            from_address = line[len("From:"):].strip()
        elif subject and from_address and not line.strip():
            body_start = i + 1
            break
    body = "\n".join(lines[body_start:])
    return from_address, subject, body


# ---------------------------------------------------------------------------
# Airbnb
# ---------------------------------------------------------------------------


class TestAirbnbParser:
    def test_detects_airbnb_channel(self) -> None:
        from_addr, subject, body = _load_fixture("airbnb_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.is_booking is True
        assert result.source_channel == "airbnb"

    def test_extracts_listing_id(self) -> None:
        from_addr, subject, body = _load_fixture("airbnb_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.source_listing_id == "12345678"

    def test_extracts_guest_name(self) -> None:
        from_addr, subject, body = _load_fixture("airbnb_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.guest_name == "John Smith"

    def test_extracts_dates(self) -> None:
        from_addr, subject, body = _load_fixture("airbnb_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.check_in == date(2026, 6, 5)
        assert result.check_out == date(2026, 6, 10)

    def test_extracts_price(self) -> None:
        from_addr, subject, body = _load_fixture("airbnb_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.total_price is not None
        assert "425" in result.total_price

    def test_extracts_booking_reference(self) -> None:
        from_addr, subject, body = _load_fixture("airbnb_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.extra.get("booking_reference") == "HMABCD123"

    def test_raw_subject_preserved(self) -> None:
        from_addr, subject, body = _load_fixture("airbnb_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.raw_subject == subject


# ---------------------------------------------------------------------------
# Furnished Finder
# ---------------------------------------------------------------------------


class TestFurnishedFinderParser:
    def test_detects_ff_channel(self) -> None:
        from_addr, subject, body = _load_fixture("furnished_finder_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.is_booking is True
        assert result.source_channel == "furnished_finder"

    def test_extracts_listing_id(self) -> None:
        from_addr, subject, body = _load_fixture("furnished_finder_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.source_listing_id == "789012"

    def test_extracts_guest_name(self) -> None:
        from_addr, subject, body = _load_fixture("furnished_finder_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.guest_name == "Sarah Johnson"

    def test_extracts_dates(self) -> None:
        from_addr, subject, body = _load_fixture("furnished_finder_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.check_in == date(2026, 7, 1)
        assert result.check_out == date(2026, 7, 31)

    def test_extracts_price(self) -> None:
        from_addr, subject, body = _load_fixture("furnished_finder_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.total_price is not None
        assert "2,200" in result.total_price or "2200" in result.total_price


# ---------------------------------------------------------------------------
# Booking.com
# ---------------------------------------------------------------------------


class TestBookingComParser:
    def test_detects_booking_com_channel(self) -> None:
        from_addr, subject, body = _load_fixture("booking_com_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.is_booking is True
        assert result.source_channel == "booking_com"

    def test_extracts_listing_id(self) -> None:
        from_addr, subject, body = _load_fixture("booking_com_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.source_listing_id == "456789"

    def test_extracts_guest_name(self) -> None:
        from_addr, subject, body = _load_fixture("booking_com_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.guest_name == "Maria Garcia"

    def test_extracts_dates(self) -> None:
        from_addr, subject, body = _load_fixture("booking_com_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.check_in == date(2026, 8, 12)
        assert result.check_out == date(2026, 8, 15)

    def test_extracts_booking_reference(self) -> None:
        from_addr, subject, body = _load_fixture("booking_com_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.extra.get("booking_reference") == "1234567890"


# ---------------------------------------------------------------------------
# Vrbo
# ---------------------------------------------------------------------------


class TestVrboParser:
    def test_detects_vrbo_channel(self) -> None:
        from_addr, subject, body = _load_fixture("vrbo_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.is_booking is True
        assert result.source_channel == "vrbo"

    def test_extracts_listing_id(self) -> None:
        from_addr, subject, body = _load_fixture("vrbo_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.source_listing_id == "321654"

    def test_extracts_guest_name(self) -> None:
        from_addr, subject, body = _load_fixture("vrbo_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.guest_name == "Robert Wilson"

    def test_extracts_dates(self) -> None:
        from_addr, subject, body = _load_fixture("vrbo_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.check_in == date(2026, 9, 4)
        assert result.check_out == date(2026, 9, 11)

    def test_extracts_booking_reference(self) -> None:
        from_addr, subject, body = _load_fixture("vrbo_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        assert result.extra.get("booking_reference") == "VB2026090412345"


# ---------------------------------------------------------------------------
# Non-booking emails — is_booking = False
# ---------------------------------------------------------------------------


class TestNonBookingEmails:
    def test_invoice_email_not_detected_as_booking(self) -> None:
        result = parse_booking_email(
            from_address="billing@vendor.com",
            subject="Invoice #1234 for Services",
            body="Please find attached your invoice for $500.",
        )
        assert result.is_booking is False
        assert result.source_channel is None

    def test_none_from_address(self) -> None:
        result = parse_booking_email(
            from_address=None,
            subject="Some random email",
            body="Body text.",
        )
        assert result.is_booking is False

    def test_airbnb_from_non_booking_subject(self) -> None:
        """Airbnb marketing email — subject doesn't match booking keywords."""
        result = parse_booking_email(
            from_address="automated@airbnb.com",
            subject="Your host profile has been updated",
            body="We've updated your host profile.",
        )
        assert result.is_booking is False

    def test_empty_email(self) -> None:
        result = parse_booking_email(
            from_address="",
            subject="",
            body="",
        )
        assert result.is_booking is False


# ---------------------------------------------------------------------------
# to_payload serialisation
# ---------------------------------------------------------------------------


class TestToPayload:
    def test_all_extracted_fields_present(self) -> None:
        from_addr, subject, body = _load_fixture("airbnb_reservation.txt")
        result = parse_booking_email(
            from_address=from_addr, subject=subject, body=body
        )
        payload = result.to_payload()
        assert payload["source_channel"] == "airbnb"
        assert payload["source_listing_id"] == "12345678"
        assert payload["guest_name"] == "John Smith"
        assert payload["check_in"] == "2026-06-05"
        assert payload["check_out"] == "2026-06-10"
        assert payload["raw_subject"] == subject
        assert "booking_reference" in payload

    def test_none_fields_serialise_as_null(self) -> None:
        result = BookingParseResult(
            is_booking=True,
            source_channel="airbnb",
            source_listing_id=None,
            guest_name=None,
            check_in=None,
            check_out=None,
            total_price=None,
        )
        payload = result.to_payload()
        assert payload["source_listing_id"] is None
        assert payload["guest_name"] is None
        assert payload["check_in"] is None
        assert payload["check_out"] is None
