"""Unit tests for platform_shared.services.transparency.kofi_service.

Covers the three responsibilities: parsing the form-encoded webhook body,
verifying the static verification_token (NOT HMAC), and recording a
donation into the monthly bucket with idempotency on message_id.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from urllib.parse import urlencode

import pytest

from platform_shared.schemas.transparency import TransparencyDocument
from platform_shared.services.transparency import kofi_service
from platform_shared.services.transparency.kofi_service import (
    KofiPayload,
    parse_kofi_form_body,
    record_donation,
    verify_kofi_token,
)

_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=timezone.utc)


def _form_body(payload: dict) -> bytes:
    """Encode a payload the way Ko-fi does: data=<url-encoded JSON>."""
    return urlencode({"data": json.dumps(payload)}).encode("utf-8")


def _payload(**overrides) -> dict:
    base = {
        "verification_token": "tok-123",
        "message_id": "msg-1",
        "type": "Donation",
        "amount": "5.00",
        "currency": "USD",
        "is_public": True,
        "timestamp": "2026-06-15T12:00:00Z",
    }
    base.update(overrides)
    return base


class TestAmountCents:
    @pytest.mark.parametrize(
        ("amount", "expected"),
        [
            ("5.00", 500),
            ("3", 300),
            ("12.50", 1250),
            ("0.99", 99),
            ("100", 10000),
            ("0.005", 1),  # half-cent must round UP (not banker's-round to 0)
            ("", 0),
            ("abc", 0),
            ("0", 0),
            ("-1.00", 0),
        ],
    )
    def test_amount_to_cents(self, amount: str, expected: int) -> None:
        assert KofiPayload({"amount": amount}).amount_cents == expected


class TestParseFormBody:
    def test_valid_body_parses(self) -> None:
        payload = parse_kofi_form_body(_form_body(_payload()))
        assert payload is not None
        assert payload["verification_token"] == "tok-123"
        assert payload["message_id"] == "msg-1"

    def test_missing_data_field_returns_none(self) -> None:
        assert parse_kofi_form_body(b"foo=bar") is None

    def test_invalid_json_returns_none(self) -> None:
        assert parse_kofi_form_body(urlencode({"data": "not json{"}).encode()) is None

    def test_non_object_json_returns_none(self) -> None:
        assert parse_kofi_form_body(urlencode({"data": "[1, 2, 3]"}).encode()) is None

    def test_non_utf8_body_returns_none(self) -> None:
        assert parse_kofi_form_body(b"\xff\xfe\x00bad") is None


class TestVerifyToken:
    def test_matching_token_passes(self) -> None:
        payload = KofiPayload(_payload(verification_token="secret"))
        assert verify_kofi_token(payload, expected_token="secret") is True

    def test_mismatched_token_fails(self) -> None:
        payload = KofiPayload(_payload(verification_token="wrong"))
        assert verify_kofi_token(payload, expected_token="secret") is False

    def test_empty_expected_token_always_fails(self) -> None:
        """A writer with no configured token must reject everything."""
        payload = KofiPayload(_payload(verification_token=""))
        assert verify_kofi_token(payload, expected_token="") is False

    def test_empty_payload_token_against_real_token_fails(self) -> None:
        payload = KofiPayload(_payload(verification_token=""))
        assert verify_kofi_token(payload, expected_token="secret") is False


class TestRecordDonation:
    def test_new_donation_increments_and_returns_true(self) -> None:
        doc = TransparencyDocument()
        payload = KofiPayload(_payload(message_id="m1", amount="5.00"))
        recorded = record_donation(doc, payload, _NOW)
        assert recorded is True
        bucket = doc.months["2026-06"]
        assert bucket.donations_cents == 500
        assert bucket.donation_message_ids == ["m1"]
        assert doc.updated_at == _NOW.isoformat()

    def test_two_distinct_donations_sum(self) -> None:
        doc = TransparencyDocument()
        record_donation(doc, KofiPayload(_payload(message_id="m1", amount="5.00")), _NOW)
        record_donation(doc, KofiPayload(_payload(message_id="m2", amount="3.00")), _NOW)
        assert doc.months["2026-06"].donations_cents == 800
        assert doc.months["2026-06"].donation_message_ids == ["m1", "m2"]

    def test_duplicate_message_id_is_noop_returns_false(self) -> None:
        doc = TransparencyDocument()
        payload = KofiPayload(_payload(message_id="m1", amount="5.00"))
        record_donation(doc, payload, _NOW)
        again = record_donation(doc, payload, _NOW)
        assert again is False
        assert doc.months["2026-06"].donations_cents == 500
        assert doc.months["2026-06"].donation_message_ids == ["m1"]

    def test_donations_bucket_by_month(self) -> None:
        doc = TransparencyDocument()
        may = datetime(2026, 5, 20, tzinfo=timezone.utc)
        june = datetime(2026, 6, 1, tzinfo=timezone.utc)
        record_donation(doc, KofiPayload(_payload(message_id="m1", amount="5.00")), may)
        record_donation(doc, KofiPayload(_payload(message_id="m2", amount="7.00")), june)
        assert doc.months["2026-05"].donations_cents == 500
        assert doc.months["2026-06"].donations_cents == 700

    def test_zero_amount_records_id_but_not_total(self) -> None:
        """A verified zero/blank-amount event is deduped but moves no money."""
        doc = TransparencyDocument()
        payload = KofiPayload(_payload(message_id="m1", amount=""))
        recorded = record_donation(doc, payload, _NOW)
        assert recorded is True
        assert doc.months["2026-06"].donations_cents == 0
        assert "m1" in doc.months["2026-06"].donation_message_ids

    def test_non_usd_is_summed_with_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        doc = TransparencyDocument()
        payload = KofiPayload(_payload(message_id="m1", amount="5.00", currency="EUR"))
        with caplog.at_level(logging.WARNING, logger="platform_shared.services.transparency.kofi_service"):
            record_donation(doc, payload, _NOW)
        assert doc.months["2026-06"].donations_cents == 500
        assert any("non-USD" in r.message for r in caplog.records)

    def test_missing_message_id_is_refused(self, caplog: pytest.LogCaptureFixture) -> None:
        """No message_id → can't dedup → refuse to count (avoids double-count on retry)."""
        doc = TransparencyDocument()
        payload = KofiPayload(_payload(message_id="", amount="5.00"))
        with caplog.at_level(logging.WARNING, logger="platform_shared.services.transparency.kofi_service"):
            recorded = record_donation(doc, payload, _NOW)
        assert recorded is False
        assert "2026-06" not in doc.months  # nothing recorded at all
        assert any("missing message_id" in r.message for r in caplog.records)

    def test_zero_amount_does_not_bump_updated_at(self) -> None:
        """A zero-amount event is deduped but moves no money and leaves updated_at."""
        doc = TransparencyDocument()
        recorded = record_donation(doc, KofiPayload(_payload(message_id="z1", amount="")), _NOW)
        assert recorded is True
        assert doc.months["2026-06"].donation_message_ids == ["z1"]
        assert doc.months["2026-06"].donations_cents == 0
        assert doc.updated_at is None  # not bumped for a zero-amount event
