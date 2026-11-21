"""Unit tests for platform_shared.services.transparency.transparency_store.

Covers the shared-object load/save round-trip (with a fake in-memory storage
client), the missing-vs-transient error distinction, and the pure
current-month projection into the public response shape.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from platform_shared.core.storage import StorageNotConfiguredError
from platform_shared.schemas.transparency import (
    TRANSPARENCY_OBJECT_KEY,
    MonthBucket,
    TransparencyDocument,
)
from platform_shared.schemas.transparency_donation_record import DonationRecord
from platform_shared.services.transparency import transparency_store
from tests.conftest import FakeStorageClient, make_s3_error

_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
_SETTINGS = SimpleNamespace(
    minio_endpoint="minio:9000",
    minio_access_key="k",
    minio_secret_key="s",
    minio_secure=False,
    transparency_shared_bucket="myfreeapps-shared",
)


class TestLoadSaveRoundTrip:
    def test_load_missing_object_returns_none(self, fake_storage: FakeStorageClient) -> None:
        assert transparency_store.load_document(_SETTINGS) is None

    def test_save_then_load_round_trips(self, fake_storage: FakeStorageClient) -> None:
        doc = TransparencyDocument(
            updated_at=_NOW.isoformat(),
            months={"2026-06": MonthBucket(donations_cents=2500, costs_cents=10000)},
        )
        transparency_store.save_document(_SETTINGS, doc)
        loaded = transparency_store.load_document(_SETTINGS)
        assert loaded is not None
        assert loaded.updated_at == _NOW.isoformat()
        assert loaded.months["2026-06"].donations_cents == 2500
        assert loaded.months["2026-06"].costs_cents == 10000

    def test_save_uses_canonical_key_and_content_type(self, fake_storage: FakeStorageClient) -> None:
        transparency_store.save_document(_SETTINGS, TransparencyDocument())
        key, _content, content_type = fake_storage.uploads[-1]
        assert key == TRANSPARENCY_OBJECT_KEY
        assert content_type == "application/json"

    def test_transient_s3_error_propagates(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class _Boom:
            def download_file(self, key: str) -> bytes:
                raise make_s3_error("InternalError", key)

        monkeypatch.setattr(transparency_store, "get_shared_storage", lambda settings: _Boom())
        with pytest.raises(Exception) as exc:  # noqa: PT011 — assert it's the S3Error, below
            transparency_store.load_document(_SETTINGS)
        assert "InternalError" in str(exc.value)

    def test_storage_not_configured_propagates(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def _raise(settings: object) -> None:
            raise StorageNotConfiguredError("MINIO_ENDPOINT unset")

        monkeypatch.setattr(transparency_store, "get_shared_storage", _raise)
        with pytest.raises(StorageNotConfiguredError):
            transparency_store.load_document(_SETTINGS)

    def test_missing_bucket_returns_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A not-yet-created shared bucket is the "not configured" state, not a
        transient outage: load_document returns None (→ widget hides). Lets apps
        ship /support before the operator runs the bucket-creation migration, and
        lets an app that isn't on the shared MinIO at all (e.g. MGA on Cloudflare
        R2) degrade cleanly instead of surfacing a persistent 503."""
        class _NoBucket:
            def download_file(self, key: str) -> bytes:
                raise make_s3_error("NoSuchBucket", key)

        monkeypatch.setattr(transparency_store, "get_shared_storage", lambda settings: _NoBucket())
        assert transparency_store.load_document(_SETTINGS) is None


class TestProjectResponse:
    def test_none_document_is_not_configured(self) -> None:
        resp = transparency_store.project_response(None, _NOW, [])
        assert resp.configured is False
        assert resp.costs_cents == 0
        assert resp.donations_cents == 0
        assert resp.updated_at is None
        assert resp.month == "June 2026"

    def test_current_month_with_costs_is_configured(self) -> None:
        doc = TransparencyDocument(
            updated_at=_NOW.isoformat(),
            months={"2026-06": MonthBucket(donations_cents=2500, costs_cents=10000)},
        )
        resp = transparency_store.project_response(doc, _NOW, [])
        assert resp.configured is True
        assert resp.costs_cents == 10000
        assert resp.donations_cents == 2500
        assert resp.updated_at == _NOW.isoformat()
        assert resp.month == "June 2026"

    def test_current_month_zero_costs_is_not_configured(self) -> None:
        """Donations present but costs not yet polled → still hidden."""
        doc = TransparencyDocument(
            months={"2026-06": MonthBucket(donations_cents=2500, costs_cents=0)},
        )
        resp = transparency_store.project_response(doc, _NOW, [])
        assert resp.configured is False
        assert resp.donations_cents == 2500

    def test_only_prior_month_present_is_not_configured(self) -> None:
        """A new month before its first poll reports zeros for the new month."""
        doc = TransparencyDocument(
            updated_at="2026-05-31T00:00:00+00:00",
            months={"2026-05": MonthBucket(donations_cents=999, costs_cents=10000)},
        )
        resp = transparency_store.project_response(doc, _NOW, [])
        assert resp.configured is False
        assert resp.costs_cents == 0
        assert resp.donations_cents == 0
        assert resp.month == "June 2026"


def _record(message_id: str, cents: int, *, month: str = "2026-06") -> DonationRecord:
    return DonationRecord(message_id=message_id, month=month, amount_cents=cents)


class TestDonationTotals:
    def test_response_sums_the_month_records(self) -> None:
        doc = TransparencyDocument(
            updated_at=_NOW.isoformat(),
            months={"2026-06": MonthBucket(costs_cents=10000)},
        )
        resp = transparency_store.project_response(doc, _NOW, [_record("a", 500), _record("b", 300)])
        assert resp.model_dump() == {
            "month": "June 2026",
            "costs_cents": 10000,
            "donations_cents": 800,
            "updated_at": _NOW.isoformat(),
            "configured": True,
        }

    def test_records_without_a_report_still_sum(self) -> None:
        resp = transparency_store.project_response(None, _NOW, [_record("a", 500)])
        assert resp.donations_cents == 500
        assert resp.configured is False

    def test_unmigrated_total_is_added_and_its_ids_not_counted_twice(self) -> None:
        """Mid-migration: records for the old ids exist, but report.json still
        holds their total. The total counts once; newer records add to it."""
        doc = TransparencyDocument(
            months={"2026-06": MonthBucket(donations_cents=900, donation_message_ids=["old1", "old2"])},
        )
        records = [_record("old1", 900), _record("old2", 0), _record("new", 200)]
        assert transparency_store.month_donations_cents(doc, "2026-06", records) == 1100

    def test_legacy_report_has_donation_checks_every_month(self) -> None:
        doc = TransparencyDocument(
            months={
                "2026-05": MonthBucket(donation_message_ids=["may"]),
                "2026-06": MonthBucket(donation_message_ids=["jun"]),
            },
        )
        assert transparency_store.legacy_report_has_donation(doc, "may") is True
        assert transparency_store.legacy_report_has_donation(doc, "jun") is True
        assert transparency_store.legacy_report_has_donation(doc, "x") is False
        assert transparency_store.legacy_report_has_donation(None, "may") is False


class TestHelpers:
    def test_month_key_and_label(self) -> None:
        assert transparency_store.month_key(_NOW) == "2026-06"
        assert transparency_store.month_label(_NOW) == "June 2026"

    def test_get_or_create_bucket_creates_then_reuses(self) -> None:
        doc = TransparencyDocument()
        b1 = transparency_store.get_or_create_bucket(doc, _NOW)
        b1.donations_cents = 100
        b2 = transparency_store.get_or_create_bucket(doc, _NOW)
        assert b2 is b1
        assert doc.months["2026-06"].donations_cents == 100

    def test_prune_keeps_most_recent_months(self) -> None:
        # Build 15 monthly buckets 2025-04 .. 2026-06.
        months = {}
        for year, month in [(2025, m) for m in range(4, 13)] + [(2026, m) for m in range(1, 7)]:
            months[f"{year}-{month:02d}"] = MonthBucket(costs_cents=1)
        doc = TransparencyDocument(months=months)
        assert len(doc.months) == 15
        transparency_store.prune_old_months(doc, _NOW)
        assert len(doc.months) == 13
        assert "2026-06" in doc.months
        assert "2025-04" not in doc.months  # oldest two dropped
        assert "2025-05" not in doc.months

    def test_prune_noop_when_under_limit(self) -> None:
        doc = TransparencyDocument(months={"2026-06": MonthBucket()})
        transparency_store.prune_old_months(doc, _NOW)
        assert len(doc.months) == 1
