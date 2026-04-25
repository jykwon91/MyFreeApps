"""Tests for Gmail refresh-token expiry handling in the email discovery service.

When Google rejects the stored refresh token (RefreshError) the service must:
- Record a failed sync_log row so the failure is visible in the Sync Sessions UI.
- Raise GmailAuthExpiredError so callers (route / worker) can react.

The route is expected to translate GmailAuthExpiredError into HTTP 401, and the
background worker is expected to swallow it with a warning so the scheduler
loop stays healthy.
"""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.auth.exceptions import RefreshError

from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole
from app.services.email.constants import (
    GMAIL_AUTH_EXPIRED_API_DETAIL,
    GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR,
)
from app.services.email.exceptions import GmailAuthExpiredError


def _make_ctx() -> RequestContext:
    return RequestContext(
        organization_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        org_role=OrgRole.OWNER,
    )


@pytest.mark.asyncio
async def test_discover_raises_gmail_auth_expired_on_refresh_error() -> None:
    """list_new_email_ids raising RefreshError converts to GmailAuthExpiredError."""
    ctx = _make_ctx()

    fake_db = MagicMock()
    fake_db.flush = AsyncMock()

    @asynccontextmanager
    async def fake_uow():
        yield fake_db

    fake_integration = MagicMock(access_token="enc", refresh_token="enc_refresh")

    mark_completed_calls: list[tuple[object, str, str | None]] = []

    async def fake_mark_completed(_db, log, status, *, error=None):
        mark_completed_calls.append((log, status, error))

    with (
        patch("app.services.email.email_discovery_service.unit_of_work", fake_uow),
        patch(
            "app.services.email.email_discovery_service.integration_repo.get_by_org_and_provider",
            new=AsyncMock(return_value=fake_integration),
        ),
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.timeout_stuck",
            new=AsyncMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.count_running",
            new=AsyncMock(return_value=0),
        ),
        patch(
            "app.services.email.email_discovery_service.email_queue_repo.reset_stuck",
            new=AsyncMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.get_gmail_service",
            return_value=MagicMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.email_queue_repo.get_message_ids",
            new=AsyncMock(return_value=set()),
        ),
        patch(
            "app.services.email.email_discovery_service.document_repo.get_email_message_ids",
            new=AsyncMock(return_value=set()),
        ),
        patch(
            "app.services.email.email_discovery_service.list_new_email_ids",
            side_effect=RefreshError("invalid_grant: Token has been expired or revoked."),
        ),
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.create",
            new=AsyncMock(return_value=MagicMock(id=123)),
        ) as mock_create,
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.mark_completed",
            new=fake_mark_completed,
        ),
    ):
        from app.services.email.email_discovery_service import discover_gmail_emails

        with pytest.raises(GmailAuthExpiredError):
            await discover_gmail_emails(ctx)

        # A sync_log row was created and then marked failed with the expected error.
        mock_create.assert_awaited_once()
        assert len(mark_completed_calls) == 1
        _, status, error = mark_completed_calls[0]
        assert status == "failed"
        assert error == GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR


@pytest.mark.asyncio
async def test_sync_route_returns_401_on_gmail_auth_expired() -> None:
    """POST /integrations/gmail/sync returns 401 when discovery raises GmailAuthExpiredError."""
    from fastapi import HTTPException

    ctx = _make_ctx()

    with (
        patch(
            "app.api.integrations.integration_service.check_sync_running",
            new=AsyncMock(return_value=False),
        ),
        patch(
            "app.api.integrations.discover_gmail_emails",
            side_effect=GmailAuthExpiredError("token revoked"),
        ),
    ):
        from app.api.integrations import sync_gmail

        with pytest.raises(HTTPException) as exc_info:
            await sync_gmail(ctx=ctx)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == GMAIL_AUTH_EXPIRED_API_DETAIL


@pytest.mark.asyncio
async def test_worker_logs_warning_and_returns_on_gmail_auth_expired() -> None:
    """sync_gmail_for_user swallows GmailAuthExpiredError with a warning, does not crash."""
    from dataclasses import dataclass

    @dataclass
    class FakeMembership:
        organization_id: uuid.UUID
        user_id: uuid.UUID

    user_id = uuid.uuid4()
    org_id = uuid.uuid4()

    with (
        patch("app.workers.email_sync_worker.AsyncSessionLocal") as mock_session_cls,
        patch("app.workers.email_sync_worker.organization_repo") as mock_org_repo,
        patch(
            "app.workers.email_sync_worker.discover_gmail_emails",
            side_effect=GmailAuthExpiredError("token revoked"),
        ),
        patch("app.workers.email_sync_worker.drain_gmail_fetch", new_callable=AsyncMock) as mock_fetch,
        patch("app.workers.email_sync_worker.drain_claude_extraction", new_callable=AsyncMock) as mock_extract,
        patch("app.workers.email_sync_worker.finalize_sync_log", new_callable=AsyncMock) as mock_finalize,
    ):
        mock_db = AsyncMock()
        mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_org_repo.list_for_user = AsyncMock(
            return_value=[FakeMembership(organization_id=org_id, user_id=user_id)]
        )

        from app.workers.email_sync_worker import sync_gmail_for_user

        # Should NOT raise.
        await sync_gmail_for_user(str(user_id))

    # Downstream stages are not called once auth has expired.
    mock_fetch.assert_not_awaited()
    mock_extract.assert_not_awaited()
    mock_finalize.assert_not_awaited()
