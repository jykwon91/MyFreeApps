"""Tests for in-memory access-token refresh persistence.

Google's auth library auto-refreshes the access token in-memory when the
stored one expires. Without persisting the refreshed value, every subsequent
sync would re-pay the refresh roundtrip. These tests cover the seam that
writes the new token back to integration_repo.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.email import gmail_service


def _fake_integration(org_id: uuid.UUID) -> MagicMock:
    integration = MagicMock()
    integration.organization_id = org_id
    integration.access_token = "tok_old"
    integration.refresh_token = "rt"
    return integration


def _send_service_returning(send_response: dict, *, on_execute=None) -> MagicMock:
    """Build a Gmail service stub whose send().execute() returns ``send_response``.

    Optional ``on_execute`` hook fires before the response is returned — used
    to simulate Google's auth library mutating the credentials object during
    the call.
    """
    def execute():
        if on_execute is not None:
            on_execute()
        return send_response

    service = MagicMock()
    service.users.return_value.messages.return_value.send.return_value.execute = execute
    return service


@asynccontextmanager
async def _fake_uow_yielding(db):
    yield db


class TestPersistRefreshedTokenHelper:
    """Direct coverage for gmail_service.persist_refreshed_token."""

    @pytest.mark.asyncio
    async def test_no_persist_when_token_unchanged(self) -> None:
        org_id = uuid.uuid4()
        integration = _fake_integration(org_id)
        creds = MagicMock(token="tok_old", expiry=None)

        update_calls: list = []

        async def fake_update(_db, integ, token, expiry):
            update_calls.append((integ, token, expiry))

        async def fake_get(_db, _oid, _provider):
            return integration

        with (
            patch("app.services.email.gmail_service.unit_of_work", lambda: _fake_uow_yielding(MagicMock())),
            patch("app.services.email.gmail_service.integration_repo.update_access_token", new=fake_update),
            patch("app.services.email.gmail_service.integration_repo.get_by_org_and_provider", new=fake_get),
        ):
            await gmail_service.persist_refreshed_token(integration, creds, prior_token="tok_old")

        assert update_calls == [], "no DB write when token is unchanged"

    @pytest.mark.asyncio
    async def test_persists_when_token_refreshed(self) -> None:
        org_id = uuid.uuid4()
        integration = _fake_integration(org_id)
        # creds.token has been mutated by Google's library to a fresh value.
        new_expiry = datetime(2026, 5, 13, 12, 0, 0, tzinfo=timezone.utc)
        creds = MagicMock(token="tok_new", expiry=new_expiry)

        refreshed = MagicMock()  # what integration_repo.get returns inside the helper's uow
        update_calls: list = []

        async def fake_update(_db, integ, token, expiry):
            update_calls.append((integ, token, expiry))

        async def fake_get(_db, _oid, _provider):
            return refreshed

        with (
            patch("app.services.email.gmail_service.unit_of_work", lambda: _fake_uow_yielding(MagicMock())),
            patch("app.services.email.gmail_service.integration_repo.update_access_token", new=fake_update),
            patch("app.services.email.gmail_service.integration_repo.get_by_org_and_provider", new=fake_get),
        ):
            await gmail_service.persist_refreshed_token(integration, creds, prior_token="tok_old")

        assert len(update_calls) == 1
        called_integ, called_token, called_expiry = update_calls[0]
        assert called_integ is refreshed
        assert called_token == "tok_new"
        assert called_expiry == new_expiry

    @pytest.mark.asyncio
    async def test_no_persist_when_integration_missing(self) -> None:
        org_id = uuid.uuid4()
        integration = _fake_integration(org_id)
        creds = MagicMock(token="tok_new", expiry=None)

        update_calls: list = []

        async def fake_update(_db, integ, token, expiry):
            update_calls.append((integ, token, expiry))

        async def fake_get(_db, _oid, _provider):
            return None  # integration was deleted concurrently

        with (
            patch("app.services.email.gmail_service.unit_of_work", lambda: _fake_uow_yielding(MagicMock())),
            patch("app.services.email.gmail_service.integration_repo.update_access_token", new=fake_update),
            patch("app.services.email.gmail_service.integration_repo.get_by_org_and_provider", new=fake_get),
        ):
            await gmail_service.persist_refreshed_token(integration, creds, prior_token="tok_old")

        assert update_calls == [], "no write attempted when integration is gone"


class TestSendMessagePersistence:
    """send_message integrates with persist_refreshed_token on the success path."""

    @pytest.mark.asyncio
    async def test_send_persists_token_when_refreshed_during_call(self) -> None:
        org_id = uuid.uuid4()
        integration = _fake_integration(org_id)
        creds = MagicMock(token="tok_old", expiry=None)

        def mutate_token_on_send():
            creds.token = "tok_new"
            creds.expiry = datetime(2026, 5, 13, 12, 0, 0, tzinfo=timezone.utc)

        service = _send_service_returning(
            {"id": "sent_123"}, on_execute=mutate_token_on_send,
        )

        update_calls: list = []

        async def fake_update(_db, integ, token, expiry):
            update_calls.append((integ, token, expiry))

        async def fake_get(_db, _oid, _provider):
            return MagicMock()

        with (
            patch("app.services.email.gmail_service.get_gmail_service", return_value=(service, creds)),
            patch("app.services.email.gmail_service.unit_of_work", lambda: _fake_uow_yielding(MagicMock())),
            patch("app.services.email.gmail_service.integration_repo.update_access_token", new=fake_update),
            patch("app.services.email.gmail_service.integration_repo.get_by_org_and_provider", new=fake_get),
        ):
            sent_id = await gmail_service.send_message(
                integration,
                from_address="host@example.com",
                to_address="tenant@example.com",
                subject="Test",
                body="Hello",
            )

        assert sent_id == "sent_123"
        assert len(update_calls) == 1
        _, token, _ = update_calls[0]
        assert token == "tok_new"

    @pytest.mark.asyncio
    async def test_send_does_not_persist_when_token_unchanged(self) -> None:
        org_id = uuid.uuid4()
        integration = _fake_integration(org_id)
        creds = MagicMock(token="tok_old", expiry=None)

        service = _send_service_returning({"id": "sent_456"})

        update_calls: list = []

        async def fake_update(_db, integ, token, expiry):
            update_calls.append((integ, token, expiry))

        with (
            patch("app.services.email.gmail_service.get_gmail_service", return_value=(service, creds)),
            patch("app.services.email.gmail_service.integration_repo.update_access_token", new=fake_update),
        ):
            sent_id = await gmail_service.send_message(
                integration,
                from_address="host@example.com",
                to_address="tenant@example.com",
                subject="Test",
                body="Hello",
            )

        assert sent_id == "sent_456"
        assert update_calls == []
