"""Integration tests for the shared transparency router via FastAPI TestClient.

Storage is faked in-memory. Confirms the public read maps the widget's three
states (configured / not-configured / unavailable) to the right status codes,
and the Ko-fi webhook verifies + dedups + persists, returning Ko-fi a 200.
"""
from __future__ import annotations

import asyncio
import json
import threading
from datetime import datetime, timezone
from types import SimpleNamespace
from urllib.parse import urlencode

import httpx
import pytest
import urllib3
from fastapi import FastAPI
from fastapi.testclient import TestClient

from platform_shared.api import transparency_router
from platform_shared.api.transparency_router import build_transparency_router
from platform_shared.core.storage import StorageNotConfiguredError
from platform_shared.schemas.transparency import MonthBucket, TransparencyDocument
from platform_shared.services.transparency import (
    anthropic_cost_service,
    cost_sync,
    transparency_store,
)
from tests.conftest import FakeStorageClient, make_s3_error

_FORM_HEADERS = {"Content-Type": "application/x-www-form-urlencoded"}


def _settings(**overrides) -> SimpleNamespace:
    base = dict(
        kofi_verification_token="tok-123",
        transparency_shared_bucket="myfreeapps-shared",
        minio_endpoint="minio:9000",
        minio_access_key="k",
        minio_secret_key="s",
        minio_secure=False,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _client(settings: SimpleNamespace) -> TestClient:
    app = FastAPI()
    app.include_router(build_transparency_router(settings))
    return TestClient(app)


def _payload(**overrides) -> dict:
    base = {
        "verification_token": "tok-123",
        "message_id": "msg-1",
        "type": "Donation",
        "amount": "5.00",
        "currency": "USD",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    base.update(overrides)
    return base


def _form_body(payload: dict) -> bytes:
    return urlencode({"data": json.dumps(payload)}).encode("utf-8")


def _app(settings: SimpleNamespace) -> FastAPI:
    app = FastAPI()
    app.include_router(build_transparency_router(settings))
    return app


def _donations_now(settings: SimpleNamespace) -> int:
    resp = _client(settings).get("/transparency")
    assert resp.status_code == 200
    return resp.json()["donations_cents"]


class TestGetTransparency:
    def test_not_configured_when_object_missing(self, fake_storage: FakeStorageClient) -> None:
        resp = _client(_settings()).get("/transparency")
        assert resp.status_code == 200
        body = resp.json()
        assert body["configured"] is False
        assert body["costs_cents"] == 0
        assert body["donations_cents"] == 0
        assert body["updated_at"] is None
        assert body["month"]  # human label always present

    def test_configured_returns_current_month(self, fake_storage: FakeStorageClient) -> None:
        now = datetime.now(timezone.utc)
        key = transparency_store.month_key(now)
        doc = TransparencyDocument(
            updated_at=now.isoformat(),
            months={key: MonthBucket(donations_cents=2500, costs_cents=10000)},
        )
        transparency_store.save_document(_settings(), doc)
        resp = _client(_settings()).get("/transparency")
        assert resp.status_code == 200
        body = resp.json()
        assert body["configured"] is True
        assert body["costs_cents"] == 10000
        assert body["donations_cents"] == 2500
        assert body["updated_at"] == doc.updated_at

    def test_storage_not_configured_hides_widget(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def _raise(_s: object) -> None:
            raise StorageNotConfiguredError("MINIO_ENDPOINT unset")

        monkeypatch.setattr(transparency_store, "get_shared_storage", _raise)
        resp = _client(_settings()).get("/transparency")
        assert resp.status_code == 200
        assert resp.json()["configured"] is False

    def test_transient_storage_error_returns_503(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class _Boom:
            def download_file(self, key: str) -> bytes:
                raise make_s3_error("InternalError", key)

        monkeypatch.setattr(transparency_store, "get_shared_storage", lambda s: _Boom())
        resp = _client(_settings()).get("/transparency")
        assert resp.status_code == 503


class TestKofiWebhook:
    def test_valid_donation_records_and_acks(self, fake_storage: FakeStorageClient) -> None:
        client = _client(_settings(kofi_verification_token="tok-123"))
        resp = client.post(
            "/donations/kofi-webhook",
            content=_form_body(_payload(message_id="m1", amount="5.00")),
            headers=_FORM_HEADERS,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
        assert _donations_now(_settings()) == 500

    def test_duplicate_message_id_acks_without_double_count(
        self, fake_storage: FakeStorageClient,
    ) -> None:
        client = _client(_settings(kofi_verification_token="tok-123"))
        body = _form_body(_payload(message_id="dup", amount="9.00"))
        first = client.post("/donations/kofi-webhook", content=body, headers=_FORM_HEADERS)
        second = client.post("/donations/kofi-webhook", content=body, headers=_FORM_HEADERS)
        assert first.json()["status"] == "ok"
        assert second.status_code == 200
        assert second.json()["status"] == "duplicate"
        assert _donations_now(_settings()) == 900

    def test_bad_token_rejected_401(self, fake_storage: FakeStorageClient) -> None:
        client = _client(_settings(kofi_verification_token="tok-123"))
        resp = client.post(
            "/donations/kofi-webhook",
            content=_form_body(_payload(verification_token="WRONG")),
            headers=_FORM_HEADERS,
        )
        assert resp.status_code == 401

    def test_no_token_configured_returns_404(self, fake_storage: FakeStorageClient) -> None:
        """A non-writer app (empty token) returns 404 so Ko-fi stops retrying a
        permanently-wrong endpoint (rather than 503, which means 'retry later')."""
        client = _client(_settings(kofi_verification_token=""))
        resp = client.post(
            "/donations/kofi-webhook",
            content=_form_body(_payload()),
            headers=_FORM_HEADERS,
        )
        assert resp.status_code == 404

    def test_malformed_body_returns_400(self, fake_storage: FakeStorageClient) -> None:
        client = _client(_settings(kofi_verification_token="tok-123"))
        resp = client.post(
            "/donations/kofi-webhook", content=b"not-a-kofi-body", headers=_FORM_HEADERS,
        )
        assert resp.status_code == 400


class _Clock:
    """Stands in for ``datetime`` in the router module, at a chosen moment."""

    moment = datetime(2026, 5, 31, 23, 59, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz: object = None) -> datetime:
        return cls.moment


class TestKofiRedeliveryAcrossMonths:
    def test_redelivery_after_month_rollover_is_not_counted_again(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> None:
        """Paid May 31; delivered May 31, then re-delivered June 1. It counts
        once, toward May, and June shows nothing."""
        monkeypatch.setattr(transparency_router, "datetime", _Clock)
        client = _client(_settings())
        body = _form_body(_payload(message_id="m1", amount="5.00", timestamp="2026-05-31T23:58:00Z"))

        _Clock.moment = datetime(2026, 5, 31, 23, 59, tzinfo=timezone.utc)
        assert client.post("/donations/kofi-webhook", content=body, headers=_FORM_HEADERS).status_code == 200
        _Clock.moment = datetime(2026, 6, 1, 0, 1, tzinfo=timezone.utc)
        again = client.post("/donations/kofi-webhook", content=body, headers=_FORM_HEADERS)
        assert again.status_code == 200
        assert again.json()["status"] == "duplicate"

        assert client.get("/transparency").json()["donations_cents"] == 0  # June
        _Clock.moment = datetime(2026, 5, 31, 23, 59, tzinfo=timezone.utc)
        assert client.get("/transparency").json()["donations_cents"] == 500  # May

    def test_missing_timestamp_is_refused_not_guessed(self, fake_storage: FakeStorageClient) -> None:
        payload = _payload(message_id="m1")
        del payload["timestamp"]
        resp = _client(_settings()).post(
            "/donations/kofi-webhook", content=_form_body(payload), headers=_FORM_HEADERS,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ignored"
        assert fake_storage.uploads == []


class TestKofiWebhookConcurrency:
    """Writers that run at the same moment must not erase each other's work.

    The fake makes the first two reads wait for each other, so both writers
    have read before either writes: the interleaving where writers sharing
    one object lose the first update even though Ko-fi got a 200.
    """

    @pytest.fixture
    def racing_storage(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient,
    ) -> FakeStorageClient:
        fake = FakeStorageClient(read_barrier=threading.Barrier(2, timeout=5))
        monkeypatch.setattr(transparency_store, "get_shared_storage", lambda s: fake)
        return fake

    @pytest.mark.anyio
    async def test_two_concurrent_donations_are_both_kept(
        self, racing_storage: FakeStorageClient,
    ) -> None:
        transport = httpx.ASGITransport(app=_app(_settings()))
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            first, second = await asyncio.gather(
                client.post(
                    "/donations/kofi-webhook",
                    content=_form_body(_payload(message_id="a", amount="5.00")),
                    headers=_FORM_HEADERS,
                ),
                client.post(
                    "/donations/kofi-webhook",
                    content=_form_body(_payload(message_id="b", amount="3.00")),
                    headers=_FORM_HEADERS,
                ),
            )
        assert first.json()["status"] == "ok"
        assert second.json()["status"] == "ok"
        assert _donations_now(_settings()) == 800

    @pytest.mark.anyio
    async def test_donation_during_cost_sync_is_kept(
        self, monkeypatch: pytest.MonkeyPatch, racing_storage: FakeStorageClient,
    ) -> None:
        async def _fetch(*, api_key, starting_at, ending_at=None):  # noqa: ANN001, ANN003
            return 0

        monkeypatch.setattr(anthropic_cost_service, "fetch_cost_cents", _fetch)
        settings = _settings(
            anthropic_admin_api_key="",
            vps_monthly_cost_cents=1000,
            domain_monthly_cost_cents=500,
        )
        transport = httpx.ASGITransport(app=_app(settings))
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp, _costs = await asyncio.gather(
                client.post(
                    "/donations/kofi-webhook",
                    content=_form_body(_payload(message_id="a", amount="5.00")),
                    headers=_FORM_HEADERS,
                ),
                cost_sync.run_cost_sync(settings),
            )
        assert resp.json()["status"] == "ok"
        body = _client(settings).get("/transparency").json()
        assert body["donations_cents"] == 500
        assert body["costs_cents"] == 1500


class TestKofiWebhookStorageFailure:
    def test_unwritable_donation_returns_500_with_code_logged(
        self,
        monkeypatch: pytest.MonkeyPatch,
        fake_storage: FakeStorageClient,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        def _refuse(key: str, content: bytes, content_type: str = "") -> str:
            raise make_s3_error("AccessDenied", key)

        monkeypatch.setattr(fake_storage, "upload_file", _refuse)
        resp = _client(_settings()).post(
            "/donations/kofi-webhook",
            content=_form_body(_payload(message_id="m1")),
            headers=_FORM_HEADERS,
        )
        assert resp.status_code == 500
        assert resp.json()["detail"] == "transparency_store_error"
        assert any("code=AccessDenied" in r.getMessage() for r in caplog.records)

    def test_unreachable_storage_returns_500_with_message_id_logged(
        self,
        monkeypatch: pytest.MonkeyPatch,
        fake_storage: FakeStorageClient,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        def _unreachable(key: str) -> bool:
            raise urllib3.exceptions.MaxRetryError(None, "/bkt", "connection refused")  # type: ignore[arg-type]

        monkeypatch.setattr(fake_storage, "object_exists", _unreachable)
        resp = _client(_settings()).post(
            "/donations/kofi-webhook",
            content=_form_body(_payload(message_id="m1")),
            headers=_FORM_HEADERS,
        )
        assert resp.status_code == 500
        assert any(
            "message_id=m1" in r.getMessage() and "MaxRetryError" in r.getMessage()
            for r in caplog.records
        )


class TestGetTransparencyStorageFailure:
    @pytest.mark.parametrize(
        "error",
        [
            urllib3.exceptions.MaxRetryError(None, "/bkt", "connection refused"),  # type: ignore[arg-type]
            ConnectionRefusedError("connection refused"),
        ],
    )
    def test_unreachable_storage_returns_503(
        self, monkeypatch: pytest.MonkeyPatch, fake_storage: FakeStorageClient, error: Exception,
    ) -> None:
        def _unreachable(key: str) -> bytes:
            raise error

        monkeypatch.setattr(fake_storage, "download_file", _unreachable)
        resp = _client(_settings()).get("/transparency")
        assert resp.status_code == 503
        assert resp.json()["detail"] == "transparency_unavailable"

    def test_corrupt_donation_record_returns_503_and_logs_its_key(
        self, fake_storage: FakeStorageClient, caplog: pytest.LogCaptureFixture,
    ) -> None:
        month = transparency_store.month_key(datetime.now(timezone.utc))
        key = f"transparency/donations/{month}/bad.json"
        fake_storage.upload_file(key, b"{not json", "application/json")
        resp = _client(_settings()).get("/transparency")
        assert resp.status_code == 503
        assert any(key in r.getMessage() for r in caplog.records)
