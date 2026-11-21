"""Unit tests for platform_shared.services.transparency.cost_sync.

Mocks the Anthropic fetch + the shared storage so the orchestration is tested
in isolation: costs = constants + Anthropic spend, donations are preserved,
and an Anthropic failure aborts the write (no partial/zero overwrite).
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from minio.error import S3Error

from platform_shared.schemas.transparency import MonthBucket, TransparencyDocument
from platform_shared.schemas.transparency_donation_record import DonationRecord
from platform_shared.services.transparency import (
    anthropic_cost_service,
    cost_sync,
    donation_store,
    kofi_service,
    transparency_store,
)
from platform_shared.services.transparency.donation_outcome import DonationOutcome
from platform_shared.services.transparency.kofi_service import KofiPayload
from platform_shared.services.transparency.anthropic_cost_service import AnthropicCostError
from tests.conftest import FakeStorageClient, make_s3_error, seed_transparency_document

_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=timezone.utc)


def _settings(**overrides) -> SimpleNamespace:
    base = dict(
        anthropic_admin_api_key="sk-ant-admin-x",
        vps_monthly_cost_cents=1000,
        domain_monthly_cost_cents=500,
        minio_endpoint="minio:9000",
        minio_access_key="k",
        minio_secret_key="s",
        minio_secure=False,
        transparency_shared_bucket="myfreeapps-shared",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _stub_fetch(monkeypatch: pytest.MonkeyPatch, value: int) -> None:
    async def _fetch(*, api_key, starting_at, ending_at=None):  # noqa: ANN001, ANN003
        return value

    monkeypatch.setattr(anthropic_cost_service, "fetch_cost_cents", _fetch)


class TestRunCostSync:
    @pytest.mark.anyio
    async def test_storage_round_trip_runs_off_the_event_loop(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        """MinIO calls are blocking; on the loop thread they would freeze the
        scheduler worker (and its heartbeat) for the whole round trip."""
        loop_thread = threading.get_ident()
        threads: dict[str, int] = {}
        real_load, real_save = transparency_store.load_document, transparency_store.save_document

        def _load(settings: SimpleNamespace) -> TransparencyDocument | None:
            threads["load"] = threading.get_ident()
            return real_load(settings)

        def _save(settings: SimpleNamespace, document: TransparencyDocument) -> None:
            threads["save"] = threading.get_ident()
            real_save(settings, document)

        monkeypatch.setattr(transparency_store, "load_document", _load)
        monkeypatch.setattr(transparency_store, "save_document", _save)
        _stub_fetch(monkeypatch, 0)
        await cost_sync.run_cost_sync(_settings(), now=_NOW)
        assert threads["load"] != loop_thread
        assert threads["save"] != loop_thread

    @pytest.mark.anyio
    async def test_computes_and_persists_costs(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        _stub_fetch(monkeypatch, 4500)
        costs = await cost_sync.run_cost_sync(_settings(), now=_NOW)
        # 1000 (vps) + 500 (domain) + 4500 (anthropic)
        assert costs == 6000
        loaded = transparency_store.load_document(_settings())
        assert loaded is not None
        assert loaded.months["2026-06"].costs_cents == 6000
        assert loaded.updated_at == _NOW.isoformat()

    @pytest.mark.anyio
    async def test_preserves_existing_donations(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        # Seed a doc that already has donations for the month.
        seed = TransparencyDocument(
            months={"2026-06": MonthBucket(donations_cents=2500, donation_message_ids=["m1"])},
        )
        transparency_store.save_document(_settings(), seed)

        _stub_fetch(monkeypatch, 0)
        await cost_sync.run_cost_sync(_settings(), now=_NOW)

        loaded = transparency_store.load_document(_settings())
        assert _total("2026-06") == 2500
        assert donation_store.donation_exists(_settings(), "2026-06", "m1")
        assert loaded.months["2026-06"].costs_cents == 1500  # 1000 + 500 + 0

    @pytest.mark.anyio
    async def test_no_anthropic_key_uses_constants_only(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        # fetch_cost_cents itself returns 0 for an empty key — exercise the real one.
        costs = await cost_sync.run_cost_sync(
            _settings(anthropic_admin_api_key=""), now=_NOW,
        )
        assert costs == 1500

    @pytest.mark.anyio
    async def test_anthropic_failure_aborts_write(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        async def _boom(*, api_key, starting_at, ending_at=None):  # noqa: ANN001, ANN003
            raise AnthropicCostError("API down")

        monkeypatch.setattr(anthropic_cost_service, "fetch_cost_cents", _boom)
        with pytest.raises(AnthropicCostError):
            await cost_sync.run_cost_sync(_settings(), now=_NOW)
        # No object was written — the previous figure (none here) stays intact.
        assert fake_storage.uploads == []


def _total(month: str) -> int:
    document = transparency_store.load_document(_settings())
    records = donation_store.load_month_donations(_settings(), month)
    return transparency_store.month_donations_cents(document, month, records)


class TestLegacyDonationMigration:
    """Donations recorded before per-donation objects live inside report.json.
    The first poll moves them out without losing or double counting any."""

    def _seed_legacy(self, fake_storage: FakeStorageClient) -> None:
        seed_transparency_document(
            fake_storage,
            TransparencyDocument(
                months={
                    "2026-05": MonthBucket(donations_cents=700, donation_message_ids=["may-1"]),
                    "2026-06": MonthBucket(
                        donations_cents=900, costs_cents=1500, donation_message_ids=["b", "a"],
                    ),
                },
            ),
        )

    @pytest.mark.anyio
    async def test_first_poll_moves_every_id_out_and_keeps_totals(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        self._seed_legacy(fake_storage)
        _stub_fetch(monkeypatch, 0)
        await cost_sync.run_cost_sync(_settings(), now=_NOW)

        for month, message_id in (("2026-05", "may-1"), ("2026-06", "a"), ("2026-06", "b")):
            assert donation_store.donation_exists(_settings(), month, message_id)
        loaded = transparency_store.load_document(_settings())
        assert loaded is not None
        for bucket in loaded.months.values():
            assert bucket.donation_message_ids == []
            assert bucket.donations_cents == 0
        assert _total("2026-05") == 700
        assert _total("2026-06") == 900

    @pytest.mark.anyio
    async def test_second_poll_changes_nothing(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        self._seed_legacy(fake_storage)
        _stub_fetch(monkeypatch, 0)
        await cost_sync.run_cost_sync(_settings(), now=_NOW)
        await cost_sync.run_cost_sync(_settings(), now=_NOW)
        assert _total("2026-06") == 900
        assert len(donation_store.load_month_donations(_settings(), "2026-06")) == 2

    @pytest.mark.anyio
    async def test_failure_midway_neither_loses_nor_double_counts(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        """One record is written, then storage fails. report.json still holds
        the old total, so the month still adds up to exactly 900; the next
        poll finishes the move."""
        self._seed_legacy(fake_storage)
        _stub_fetch(monkeypatch, 0)
        real_upload = fake_storage.upload_file
        writes = 0

        def _fail_on_second(key: str, content: bytes, content_type: str = "") -> str:
            nonlocal writes
            writes += 1
            if writes == 2:
                raise make_s3_error("InternalError", key)
            return real_upload(key, content, content_type)

        monkeypatch.setattr(fake_storage, "upload_file", _fail_on_second)
        with pytest.raises(S3Error):
            await cost_sync.run_cost_sync(_settings(), now=_NOW)
        assert _total("2026-05") == 700
        assert _total("2026-06") == 900

        monkeypatch.setattr(fake_storage, "upload_file", real_upload)
        await cost_sync.run_cost_sync(_settings(), now=_NOW)
        assert _total("2026-05") == 700
        assert _total("2026-06") == 900

    @pytest.mark.anyio
    async def test_redelivered_legacy_donation_is_not_counted_again(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        """Before the first poll, a re-delivery of an id still in report.json is a
        duplicate; after it, the moved record blocks it."""
        self._seed_legacy(fake_storage)
        payload = KofiPayload(
            {"message_id": "a", "amount": "4.00", "timestamp": "2026-06-10T00:00:00Z"},
        )
        assert kofi_service.record_donation(_settings(), payload) is DonationOutcome.DUPLICATE
        _stub_fetch(monkeypatch, 0)
        await cost_sync.run_cost_sync(_settings(), now=_NOW)
        assert kofi_service.record_donation(_settings(), payload) is DonationOutcome.DUPLICATE
        assert _total("2026-06") == 900


class TestDonationPruning:
    @pytest.mark.anyio
    async def test_poll_deletes_donations_older_than_retention(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        for month in ("2025-05", "2025-06", "2026-06"):
            donation_store.write_donation(
                _settings(), DonationRecord(message_id=f"m-{month}", month=month, amount_cents=100),
            )
        _stub_fetch(monkeypatch, 0)
        await cost_sync.run_cost_sync(_settings(), now=_NOW)
        assert not donation_store.donation_exists(_settings(), "2025-05", "m-2025-05")
        assert donation_store.donation_exists(_settings(), "2025-06", "m-2025-06")
        assert donation_store.donation_exists(_settings(), "2026-06", "m-2026-06")


class TestMonthArithmetic:
    @pytest.mark.parametrize(
        ("month", "expected"),
        [("2026-05", "2026-06"), ("2026-12", "2027-01")],
    )
    def test_next_month(self, month: str, expected: str) -> None:
        assert donation_store.next_month(month) == expected

    def test_oldest_retained_month_spans_thirteen_months(self) -> None:
        assert donation_store.oldest_retained_month(_NOW) == "2025-06"
