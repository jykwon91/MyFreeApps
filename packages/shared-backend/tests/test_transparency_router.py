"""Integration tests for the shared transparency router via FastAPI TestClient.

Storage is faked in-memory. Confirms the public read maps the widget's three
states (configured / not-configured / unavailable) to the right status codes,
and the Ko-fi webhook verifies + dedups + persists, returning Ko-fi a 200.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from urllib.parse import urlencode

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from platform_shared.api.transparency_router import build_transparency_router
from platform_shared.core.storage import StorageNotConfiguredError
from platform_shared.schemas.transparency import MonthBucket, TransparencyDocument
from platform_shared.services.transparency import transparency_store
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
    }
    base.update(overrides)
    return base


def _form_body(payload: dict) -> bytes:
    return urlencode({"data": json.dumps(payload)}).encode("utf-8")


@pytest.fixture
def fake_storage(monkeypatch: pytest.MonkeyPatch) -> FakeStorageClient:
    fake = FakeStorageClient()
    monkeypatch.setattr(transparency_store, "get_shared_storage", lambda s: fake)
    transparency_store.reset_shared_storage_cache()
    return fake


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
        loaded = transparency_store.load_document(_settings())
        key = transparency_store.month_key(datetime.now(timezone.utc))
        assert loaded.months[key].donations_cents == 500

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
        loaded = transparency_store.load_document(_settings())
        key = transparency_store.month_key(datetime.now(timezone.utc))
        assert loaded.months[key].donations_cents == 900

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
