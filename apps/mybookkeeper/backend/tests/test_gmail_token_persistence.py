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
from unittest.mock import MagicMock, patch

import pytest

from app.services.email import gmail_credentials, gmail_service
from tests.gmail_send_fakes import fake_gmail_post, gmail_response


def _fake_integration(org_id: uuid.UUID) -> MagicMock:
    integration = MagicMock()
    integration.organization_id = org_id
    integration.access_token = "tok_old"
    integration.refresh_token = "rt"
    return integration


@asynccontextmanager
async def _fake_uow_yielding(db):
    yield db


class TestPersistRefreshedTokenHelper:
    """Direct coverage for gmail_credentials.persist_refreshed_token."""

    @pytest.mark.asyncio
    async def test_no_persist_when_token_unchanged(self) -> None:
        org_id = uuid.uuid4()
        integration = _fake_integration(org_id)
        creds = MagicMock(token="tok_old", expiry=None)

        update_calls: list = []

        async def fake_update(_db, integ, token, expiry):
            update_calls.append((integ, token, expiry))
            return True

        with (
            patch("app.services.email.gmail_credentials.unit_of_work", lambda: _fake_uow_yielding(MagicMock())),
            patch("app.services.email.gmail_credentials.integration_repo.update_access_token_if_unchanged", new=fake_update),
        ):
            await gmail_credentials.persist_refreshed_token(integration, creds, prior_token="tok_old")

        assert update_calls == [], "no DB write when token is unchanged"

    @pytest.mark.asyncio
    async def test_persists_when_token_refreshed(self) -> None:
        org_id = uuid.uuid4()
        integration = _fake_integration(org_id)
        # creds.token has been mutated by Google's library to a fresh value.
        new_expiry = datetime(2026, 5, 13, 12, 0, 0, tzinfo=timezone.utc)
        creds = MagicMock(token="tok_new", expiry=new_expiry)

        update_calls: list = []

        async def fake_update(_db, integ, token, expiry):
            update_calls.append((integ, token, expiry))
            return True

        with (
            patch("app.services.email.gmail_credentials.unit_of_work", lambda: _fake_uow_yielding(MagicMock())),
            patch("app.services.email.gmail_credentials.integration_repo.update_access_token_if_unchanged", new=fake_update),
        ):
            await gmail_credentials.persist_refreshed_token(integration, creds, prior_token="tok_old")

        assert len(update_calls) == 1
        called_integ, called_token, called_expiry = update_calls[0]
        assert called_integ is integration
        assert called_token == "tok_new"
        assert called_expiry == new_expiry

    @pytest.mark.asyncio
    async def test_skips_quietly_when_gmail_was_reconnected(self, caplog: pytest.LogCaptureFixture) -> None:
        """The repo refuses the write when the row no longer holds this call's
        refresh token; the helper logs it and carries on."""
        integration = _fake_integration(uuid.uuid4())
        creds = MagicMock(token="tok_new", expiry=None)

        async def fake_update(_db, _integ, _token, _expiry):
            return False

        with (
            patch("app.services.email.gmail_credentials.unit_of_work", lambda: _fake_uow_yielding(MagicMock())),
            patch("app.services.email.gmail_credentials.integration_repo.update_access_token_if_unchanged", new=fake_update),
            caplog.at_level("INFO", logger="app.services.email.gmail_credentials"),
        ):
            await gmail_credentials.persist_refreshed_token(integration, creds, prior_token="tok_old")

        assert "reconnected" in caplog.text


class TestSendMessagePersistence:
    """send_message integrates with persist_refreshed_token on the success path."""

    @pytest.mark.asyncio
    async def test_send_persists_token_when_refreshed_during_call(self) -> None:
        integration = _fake_integration(uuid.uuid4())

        def refresh_during_send(creds) -> None:  # type: ignore[no-untyped-def]
            creds.token = "tok_new"
            creds.expiry = datetime(2026, 5, 13, 12, 0, 0)

        update_calls: list = []

        async def fake_update(_db, integ, token, expiry):
            update_calls.append((integ, token, expiry))
            return True

        with (
            fake_gmail_post(gmail_response(200, {"id": "sent_123"}), on_post=refresh_during_send),
            patch("app.services.email.gmail_credentials.unit_of_work", lambda: _fake_uow_yielding(MagicMock())),
            patch("app.services.email.gmail_credentials.integration_repo.update_access_token_if_unchanged", new=fake_update),
        ):
            sent_id = await gmail_service.send_message(
                integration,
                from_address="host@example.com",
                to_address="tenant@example.com",
                subject="Test",
                body="Hello",
                message_id_header="<reply-1@mybookkeeper.app>",
            )

        assert sent_id == "sent_123"
        assert len(update_calls) == 1
        _, token, _ = update_calls[0]
        assert token == "tok_new"

    @pytest.mark.asyncio
    async def test_send_does_not_persist_when_token_unchanged(self) -> None:
        integration = _fake_integration(uuid.uuid4())
        update_calls: list = []

        async def fake_update(_db, integ, token, expiry):
            update_calls.append((integ, token, expiry))
            return True

        with (
            fake_gmail_post(gmail_response(200, {"id": "sent_456"})),
            patch("app.services.email.gmail_credentials.integration_repo.update_access_token_if_unchanged", new=fake_update),
        ):
            sent_id = await gmail_service.send_message(
                integration,
                from_address="host@example.com",
                to_address="tenant@example.com",
                subject="Test",
                body="Hello",
                message_id_header="<reply-1@mybookkeeper.app>",
            )

        assert sent_id == "sent_456"
        assert update_calls == []
