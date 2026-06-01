"""Unit tests for platform_shared.services.transparency.cost_sync.

Mocks the Anthropic fetch + the shared storage so the orchestration is tested
in isolation: costs = constants + Anthropic spend, donations are preserved,
and an Anthropic failure aborts the write (no partial/zero overwrite).
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from platform_shared.schemas.transparency import MonthBucket, TransparencyDocument
from platform_shared.services.transparency import (
    anthropic_cost_service,
    cost_sync,
    transparency_store,
)
from platform_shared.services.transparency.anthropic_cost_service import AnthropicCostError
from tests.conftest import FakeStorageClient

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


@pytest.fixture
def fake_storage(monkeypatch: pytest.MonkeyPatch) -> FakeStorageClient:
    fake = FakeStorageClient()
    monkeypatch.setattr(transparency_store, "get_shared_storage", lambda settings: fake)
    transparency_store.reset_shared_storage_cache()
    return fake


def _stub_fetch(monkeypatch: pytest.MonkeyPatch, value: int) -> None:
    async def _fetch(*, api_key, starting_at, ending_at=None):  # noqa: ANN001, ANN003
        return value

    monkeypatch.setattr(anthropic_cost_service, "fetch_cost_cents", _fetch)


class TestRunCostSync:
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
        assert loaded.months["2026-06"].donations_cents == 2500
        assert loaded.months["2026-06"].donation_message_ids == ["m1"]
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
