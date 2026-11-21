"""Unit tests for platform_shared.services.transparency.kofi_service.

Covers the three responsibilities: parsing the form-encoded webhook body,
verifying the static verification_token (NOT HMAC), and recording a
donation into the monthly bucket with idempotency on message_id.
"""
from __future__ import annotations

import json
import logging
from types import SimpleNamespace
from urllib.parse import urlencode

import pytest
from minio.error import S3Error

from platform_shared.schemas.transparency import MonthBucket, TransparencyDocument
from platform_shared.schemas.transparency_donation_record import DonationRecord
from platform_shared.services.transparency import donation_store, transparency_store
from platform_shared.services.transparency.donation_outcome import DonationOutcome
from platform_shared.services.transparency.kofi_service import (
    KofiPayload,
    parse_kofi_form_body,
    record_donation,
    verify_kofi_token,
)
from tests.conftest import FakeStorageClient, make_s3_error, seed_transparency_document



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


_SETTINGS = SimpleNamespace(
    minio_endpoint="minio:9000",
    minio_access_key="k",
    minio_secret_key="s",
    minio_secure=False,
    transparency_shared_bucket="myfreeapps-shared",
)


def _records(month: str = "2026-06") -> list[DonationRecord]:
    return donation_store.load_month_donations(_SETTINGS, month)


class TestDonationMonth:
    @pytest.mark.parametrize(
        ("timestamp", "expected"),
        [
            ("2026-06-15T12:00:00Z", "2026-06"),
            ("2026-05-31T23:59:59Z", "2026-05"),
            ("2026-06-01T01:00:00+02:00", "2026-05"),  # 23:00 UTC on May 31
            ("2026-06-15T12:00:00", "2026-06"),  # no zone → UTC
            ("", None),
            ("yesterday", None),
        ],
    )
    def test_month_comes_from_kofi_timestamp(self, timestamp: str, expected: str | None) -> None:
        assert KofiPayload(_payload(timestamp=timestamp)).donation_month == expected


class TestRecordDonation:
    def test_new_donation_is_stored_as_its_own_record(self, fake_storage: FakeStorageClient) -> None:
        payload = KofiPayload(_payload(message_id="m1", amount="5.00"))
        assert record_donation(_SETTINGS, payload) is DonationOutcome.RECORDED
        assert _records() == [
            DonationRecord(message_id="m1", month="2026-06", amount_cents=500, currency="USD", type="Donation"),
        ]
        assert fake_storage.uploads[-1][0] == "transparency/donations/2026-06/m1.json"

    def test_two_distinct_donations_are_two_records(self, fake_storage: FakeStorageClient) -> None:
        record_donation(_SETTINGS, KofiPayload(_payload(message_id="m1", amount="5.00")))
        record_donation(_SETTINGS, KofiPayload(_payload(message_id="m2", amount="3.00")))
        assert sorted(r.amount_cents for r in _records()) == [300, 500]

    def test_duplicate_message_id_is_noop_returns_false(self, fake_storage: FakeStorageClient) -> None:
        payload = KofiPayload(_payload(message_id="m1", amount="5.00"))
        record_donation(_SETTINGS, payload)
        uploads = len(fake_storage.uploads)
        assert record_donation(_SETTINGS, payload) is DonationOutcome.DUPLICATE
        assert len(fake_storage.uploads) == uploads
        assert len(_records()) == 1

    def test_redelivery_received_in_a_later_month_is_a_duplicate(
        self, fake_storage: FakeStorageClient,
    ) -> None:
        """The month comes from Ko-fi's timestamp, not arrival time, so the
        re-delivery maps to the same key whenever it arrives."""
        payload = KofiPayload(_payload(message_id="m1", amount="5.00", timestamp="2026-05-31T23:58:00Z"))
        assert record_donation(_SETTINGS, payload) is DonationOutcome.RECORDED
        assert record_donation(_SETTINGS, payload) is DonationOutcome.DUPLICATE
        assert [r.amount_cents for r in _records("2026-05")] == [500]
        assert _records("2026-06") == []

    def test_rewriting_the_same_donation_produces_identical_bytes(
        self, fake_storage: FakeStorageClient,
    ) -> None:
        """Even if two copies race past the existence check, both write the same
        content to the same key, so the month still counts it once."""
        record = DonationRecord(message_id="m1", month="2026-06", amount_cents=500)
        donation_store.write_donation(_SETTINGS, record)
        first = dict(fake_storage.objects)
        donation_store.write_donation(_SETTINGS, record)
        assert fake_storage.objects == first

    def test_id_still_in_old_report_is_a_duplicate(self, fake_storage: FakeStorageClient) -> None:
        seed_transparency_document(
            fake_storage,
            TransparencyDocument(months={"2026-05": MonthBucket(donations_cents=500, donation_message_ids=["m1"])}),
        )
        assert record_donation(_SETTINGS, KofiPayload(_payload(message_id="m1"))) is DonationOutcome.DUPLICATE
        assert _records() == []

    def test_zero_amount_records_id_but_no_money(self, fake_storage: FakeStorageClient) -> None:
        """A verified zero/blank-amount event is deduped but moves no money."""
        payload = KofiPayload(_payload(message_id="m1", amount=""))
        assert record_donation(_SETTINGS, payload) is DonationOutcome.RECORDED
        assert [r.amount_cents for r in _records()] == [0]
        assert record_donation(_SETTINGS, payload) is DonationOutcome.DUPLICATE

    def test_non_usd_is_summed_with_warning(
        self, fake_storage: FakeStorageClient, caplog: pytest.LogCaptureFixture,
    ) -> None:
        payload = KofiPayload(_payload(message_id="m1", amount="5.00", currency="EUR"))
        with caplog.at_level(logging.WARNING, logger="platform_shared.services.transparency.kofi_service"):
            record_donation(_SETTINGS, payload)
        assert [r.amount_cents for r in _records()] == [500]
        assert any("non-USD" in r.message for r in caplog.records)

    def test_missing_message_id_is_refused(
        self, fake_storage: FakeStorageClient, caplog: pytest.LogCaptureFixture,
    ) -> None:
        """No message_id → can't dedup → refuse to count (avoids double-count on retry)."""
        payload = KofiPayload(_payload(message_id="", amount="5.00"))
        with caplog.at_level(logging.WARNING, logger="platform_shared.services.transparency.kofi_service"):
            assert record_donation(_SETTINGS, payload) is DonationOutcome.REFUSED
        assert fake_storage.uploads == []
        assert any(
            r.levelno == logging.ERROR and "message_id missing or malformed" in r.message
            for r in caplog.records
        )

    @pytest.mark.parametrize(
        "message_id",
        ["../m1", "m1/extra", "m 1", "m1.json", "x" * 101, "m_1"],
    )
    def test_malformed_message_id_is_refused_not_reshaped(
        self, message_id: str, fake_storage: FakeStorageClient,
    ) -> None:
        """Reshaping a bad id could merge two donations onto one key, so it is
        refused instead (and never reaches a storage key)."""
        payload = KofiPayload(_payload(message_id=message_id))
        assert record_donation(_SETTINGS, payload) is DonationOutcome.REFUSED
        assert fake_storage.uploads == []

    def test_uuid_message_id_is_accepted(self, fake_storage: FakeStorageClient) -> None:
        payload = KofiPayload(_payload(message_id="3a1fac0c-f960-4506-a60e-824979a74e74"))
        assert record_donation(_SETTINGS, payload) is DonationOutcome.RECORDED

    def test_missing_timestamp_is_refused(
        self, fake_storage: FakeStorageClient, caplog: pytest.LogCaptureFixture,
    ) -> None:
        payload = KofiPayload(_payload(message_id="m1", timestamp=""))
        with caplog.at_level(logging.WARNING, logger="platform_shared.services.transparency.kofi_service"):
            assert record_donation(_SETTINGS, payload) is DonationOutcome.REFUSED
        assert fake_storage.uploads == []
        assert any(
            r.levelno == logging.ERROR and "no usable timestamp" in r.message
            for r in caplog.records
        )

    def test_migrated_record_filed_one_month_later_is_a_duplicate(
        self, fake_storage: FakeStorageClient,
    ) -> None:
        """Paid May 31, received June 1 under the old code, so its migrated record
        sits under June. A re-delivery (May by its timestamp) must still match."""
        donation_store.write_donation(
            _SETTINGS,
            DonationRecord(message_id="m1", month="2026-06", amount_cents=500, migrated_from_report=True),
        )
        payload = KofiPayload(_payload(message_id="m1", amount="5.00", timestamp="2026-05-31T23:58:00Z"))
        assert record_donation(_SETTINGS, payload) is DonationOutcome.DUPLICATE
        assert _records("2026-05") == []

    def test_migration_between_the_two_checks_is_still_seen(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        """The poll migrates right after the webhook's first dedup read. Whatever
        that read was, the second must see the donation, or the webhook would
        overwrite the migrated record (losing or doubling the month's total)."""
        seed_transparency_document(
            fake_storage,
            TransparencyDocument(
                months={"2026-06": MonthBucket(donations_cents=900, donation_message_ids=["a", "b"])},
            ),
        )
        migrated = False

        def _migrate_once() -> None:
            nonlocal migrated
            if migrated:
                return
            migrated = True
            document = transparency_store.load_document(_SETTINGS)
            assert document is not None
            donation_store.migrate_legacy_donations(_SETTINGS, document)
            transparency_store.save_document(_SETTINGS, document)

        real_download, real_exists = fake_storage.download_file, fake_storage.object_exists

        def _download_then_migrate(key: str) -> bytes:
            content = real_download(key)
            _migrate_once()
            return content

        def _exists_then_migrate(key: str) -> bool:
            found = real_exists(key)
            _migrate_once()
            return found

        monkeypatch.setattr(fake_storage, "download_file", _download_then_migrate)
        monkeypatch.setattr(fake_storage, "object_exists", _exists_then_migrate)
        payload = KofiPayload(_payload(message_id="a", amount="4.00", timestamp="2026-06-10T00:00:00Z"))
        assert record_donation(_SETTINGS, payload) is DonationOutcome.DUPLICATE

        monkeypatch.setattr(fake_storage, "download_file", real_download)
        document = transparency_store.load_document(_SETTINGS)
        assert transparency_store.month_donations_cents(document, "2026-06", _records()) == 900

    def test_storage_error_propagates(self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient) -> None:
        def _refuse(key: str, content: bytes, content_type: str = "") -> str:
            raise make_s3_error("AccessDenied", key)

        monkeypatch.setattr(fake_storage, "upload_file", _refuse)
        with pytest.raises(S3Error):
            record_donation(_SETTINGS, KofiPayload(_payload(message_id="m1")))
