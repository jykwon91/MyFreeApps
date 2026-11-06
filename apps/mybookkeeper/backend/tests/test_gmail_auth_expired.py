"""Tests for Gmail refresh-token expiry handling in the email discovery service.

When Google rejects the stored refresh token (RefreshError) the service must:
- Set needs_reauth=True on the Integration row.
- Record a failed sync_log row so the failure is visible in the Sync Sessions UI.
- Raise GmailAuthExpiredError so callers (route / worker) can react.

The route is expected to translate GmailAuthExpiredError into HTTP 401, and the
background worker is expected to swallow it with a warning so the scheduler
loop stays healthy.

The scheduler must skip integrations where needs_reauth=True so it does not
burn Google API quota retrying dead tokens on every cycle: that is checked on
real rows in ``test_integration_org_scope.py``.
"""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.auth.exceptions import RefreshError

from app.core.context import RequestContext
from app.models.integrations.gmail_sync_target import GmailSyncTarget
from app.models.organization.organization_member import OrgRole
from app.services.email.constants import (
    GMAIL_AUTH_EXPIRED_API_DETAIL,
    GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR,
)
from app.services.email.exceptions import GmailAuthExpiredError
from app.workers.email_sync_worker import sync_gmail_connection


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
            "app.services.email.email_discovery_service.integration_repo.mark_needs_reauth_if_unchanged",
            new=AsyncMock(return_value=True),
        ),
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
            return_value=(MagicMock(), MagicMock(token="t0")),
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
            "app.services.email.email_discovery_service.email_filter_log_repo.get_message_ids",
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
    """sync_gmail_connection swallows GmailAuthExpiredError with a warning, does not crash."""
    target = GmailSyncTarget(organization_id=uuid.uuid4(), user_id=uuid.uuid4())

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
        mock_org_repo.get_member = AsyncMock(return_value=MagicMock())

        # Should NOT raise.
        await sync_gmail_connection(target)

    # Downstream stages are not called once auth has expired.
    mock_fetch.assert_not_awaited()
    mock_extract.assert_not_awaited()
    mock_finalize.assert_not_awaited()


@pytest.mark.asyncio
async def test_discovery_sets_needs_reauth_on_refresh_error() -> None:
    """When RefreshError is raised during discovery, mark_needs_reauth is called
    on the integration before GmailAuthExpiredError propagates to the caller.

    This is the critical seam: the DB flag must be committed so the scheduler
    skips the integration on the next cycle, even if the caller crashes after
    receiving the exception.
    """
    ctx = _make_ctx()

    fake_db = MagicMock()
    fake_db.flush = AsyncMock()

    @asynccontextmanager
    async def fake_uow():
        yield fake_db

    fake_integration = MagicMock(access_token="enc", refresh_token="enc_refresh")

    mark_reauth_calls: list[tuple] = []

    async def fake_mark_needs_reauth(_db, integration, error, failed_at):
        mark_reauth_calls.append((integration, error, failed_at))
        return True

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
            return_value=(MagicMock(), MagicMock(token="t0")),
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
            "app.services.email.email_discovery_service.email_filter_log_repo.get_message_ids",
            new=AsyncMock(return_value=set()),
        ),
        patch(
            "app.services.email.email_discovery_service.list_new_email_ids",
            side_effect=RefreshError("invalid_grant: Token has been expired or revoked."),
        ),
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.create",
            new=AsyncMock(return_value=MagicMock(id=123)),
        ),
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.mark_completed",
            new=AsyncMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.integration_repo.mark_needs_reauth_if_unchanged",
            new=fake_mark_needs_reauth,
        ),
    ):
        from app.services.email.email_discovery_service import discover_gmail_emails

        with pytest.raises(GmailAuthExpiredError):
            await discover_gmail_emails(ctx)

    # mark_needs_reauth must be called exactly once, for the connection discovery ran on.
    assert len(mark_reauth_calls) == 1
    integration_arg, error_arg, failed_at_arg = mark_reauth_calls[0]
    assert integration_arg.id == fake_integration.id
    assert integration_arg.refresh_token_encrypted == fake_integration.refresh_token_encrypted
    assert "invalid_grant" in error_arg or "RefreshError" in error_arg
    assert failed_at_arg is not None
