"""Tests for Gmail token refresh / 401 reauth flag handling.

Regression coverage for two related bugs:

1. ``email_fetch_service._fetch_next_pending`` did not catch ``HttpError`` with
   status==401.  Google can reject a token via a 401 HTTP response (e.g. when
   the user revokes access via myaccount.google.com) rather than raising a
   ``RefreshError``.  Without this handler the queue item was marked ``failed``
   but ``Integration.needs_reauth`` stayed ``False``, so the UI never prompted
   the user to reconnect.

2. ``gmail_service.send_message`` and ``send_message_with_attachment`` raised
   ``GmailReauthRequiredError`` without first setting
   ``Integration.needs_reauth = True``, violating the docstring contract.
"""
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError

from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole
from app.services.email.exceptions import GmailReauthRequiredError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ctx() -> RequestContext:
    return RequestContext(
        organization_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        org_role=OrgRole.OWNER,
    )


def _make_integration(org_id: uuid.UUID) -> MagicMock:
    integration = MagicMock()
    integration.organization_id = org_id
    integration.access_token = "tok_access"
    integration.refresh_token = "tok_refresh"
    integration.needs_reauth = False
    return integration


def _make_fake_http_error(status: int) -> HttpError:
    """Build a minimal HttpError that looks like a real Google API error."""
    resp = MagicMock()
    resp.status = status
    return HttpError(resp=resp, content=b"Unauthorized")


def _make_queue_item(org_id: uuid.UUID) -> MagicMock:
    item = MagicMock()
    item.id = uuid.uuid4()
    item.message_id = "gmail_msg_abc"
    item.sync_log_id = 1
    item.attachment_id = "att_123"
    return item


# ---------------------------------------------------------------------------
# Fix 2: email_fetch_service — HttpError 401 sets needs_reauth
# ---------------------------------------------------------------------------

class TestFetchPathHttpError401:
    """_fetch_next_pending must set needs_reauth when Gmail returns 401."""

    @pytest.mark.asyncio
    async def test_fetch_401_sets_needs_reauth(self) -> None:
        """HttpError 401 during Gmail fetch must mark the integration for reauth
        and raise GmailReauthRequiredError to stop the drain loop."""
        ctx = _make_ctx()
        org_id = ctx.organization_id
        integration = _make_integration(org_id)
        item = _make_queue_item(org_id)

        fake_db = MagicMock()
        fake_db.flush = AsyncMock()

        @asynccontextmanager
        async def fake_uow():
            yield fake_db

        mark_calls: list[tuple] = []

        async def fake_mark_needs_reauth(_db, integ, error, failed_at):
            mark_calls.append((integ, error, failed_at))
            integ.needs_reauth = True

        async def fake_get_by_id(_db, item_id):
            return item

        async def fake_mark_status(_db, item_ref, status, *, error=None):
            item_ref.status = status
            item_ref.error = error

        with (
            patch(
                "app.services.email.email_fetch_service.unit_of_work", fake_uow
            ),
            patch(
                "app.services.email.email_fetch_service.AsyncSessionLocal", fake_uow
            ),
            patch(
                "app.services.email.email_fetch_service.email_queue_repo.claim_next_pending",
                new=AsyncMock(return_value=item),
            ),
            patch(
                "app.services.email.email_fetch_service.integration_repo.get_by_org_and_provider",
                new=AsyncMock(return_value=integration),
            ),
            patch(
                "app.services.email.email_fetch_service.integration_repo.mark_needs_reauth",
                new=fake_mark_needs_reauth,
            ),
            patch(
                "app.services.email.email_fetch_service.email_queue_repo.get_by_id",
                new=fake_get_by_id,
            ),
            patch(
                "app.services.email.email_fetch_service.email_queue_repo.mark_status",
                new=fake_mark_status,
            ),
            patch(
                "app.services.email.email_fetch_service.get_gmail_service",
                return_value=(MagicMock(), MagicMock(token="t0")),
            ),
            patch(
                "app.services.email.email_fetch_service.fetch_attachment_bytes",
                side_effect=_make_fake_http_error(401),
            ),
        ):
            from app.services.email.email_fetch_service import _fetch_next_pending

            with pytest.raises(GmailReauthRequiredError):
                await _fetch_next_pending(ctx)

        assert len(mark_calls) == 1, "mark_needs_reauth must be called exactly once"
        marked_integration, error_msg, failed_at = mark_calls[0]
        assert marked_integration is integration
        assert "401" in error_msg
        assert failed_at.tzinfo is not None
        assert integration.needs_reauth is True
        assert item.status == "failed"
        assert item.error == "Gmail auth expired (401)"

    @pytest.mark.asyncio
    async def test_fetch_refresh_error_still_sets_needs_reauth(self) -> None:
        """Existing RefreshError path must still set needs_reauth (regression guard)."""
        ctx = _make_ctx()
        org_id = ctx.organization_id
        integration = _make_integration(org_id)
        item = _make_queue_item(org_id)

        fake_db = MagicMock()
        fake_db.flush = AsyncMock()

        @asynccontextmanager
        async def fake_uow():
            yield fake_db

        mark_calls: list[tuple] = []

        async def fake_mark_needs_reauth(_db, integ, error, failed_at):
            mark_calls.append((integ, error, failed_at))
            integ.needs_reauth = True

        async def fake_get_by_id(_db, item_id):
            return item

        async def fake_mark_status(_db, item_ref, status, *, error=None):
            item_ref.status = status

        with (
            patch(
                "app.services.email.email_fetch_service.unit_of_work", fake_uow
            ),
            patch(
                "app.services.email.email_fetch_service.AsyncSessionLocal", fake_uow
            ),
            patch(
                "app.services.email.email_fetch_service.email_queue_repo.claim_next_pending",
                new=AsyncMock(return_value=item),
            ),
            patch(
                "app.services.email.email_fetch_service.integration_repo.get_by_org_and_provider",
                new=AsyncMock(return_value=integration),
            ),
            patch(
                "app.services.email.email_fetch_service.integration_repo.mark_needs_reauth",
                new=fake_mark_needs_reauth,
            ),
            patch(
                "app.services.email.email_fetch_service.email_queue_repo.get_by_id",
                new=fake_get_by_id,
            ),
            patch(
                "app.services.email.email_fetch_service.email_queue_repo.mark_status",
                new=fake_mark_status,
            ),
            patch(
                "app.services.email.email_fetch_service.get_gmail_service",
                return_value=(MagicMock(), MagicMock(token="t0")),
            ),
            patch(
                "app.services.email.email_fetch_service.fetch_attachment_bytes",
                side_effect=RefreshError("invalid_grant"),
            ),
        ):
            from app.services.email.email_fetch_service import _fetch_next_pending

            with pytest.raises(GmailReauthRequiredError):
                await _fetch_next_pending(ctx)

        assert len(mark_calls) == 1
        assert integration.needs_reauth is True

    @pytest.mark.asyncio
    async def test_fetch_non_401_http_error_does_not_set_needs_reauth(self) -> None:
        """HttpError with status != 401 must NOT set needs_reauth — it is a transient error."""
        ctx = _make_ctx()
        org_id = ctx.organization_id
        integration = _make_integration(org_id)
        item = _make_queue_item(org_id)

        fake_db = MagicMock()
        fake_db.flush = AsyncMock()

        @asynccontextmanager
        async def fake_uow():
            yield fake_db

        mark_calls: list[tuple] = []

        async def fake_mark_needs_reauth(_db, integ, error, failed_at):
            mark_calls.append((integ, error, failed_at))

        async def fake_get_by_id(_db, item_id):
            return item

        async def fake_mark_status(_db, item_ref, status, *, error=None):
            item_ref.status = status

        async def fake_fail_sync_log_if_done(_db, sync_log_id, error_msg):
            pass

        with (
            patch(
                "app.services.email.email_fetch_service.unit_of_work", fake_uow
            ),
            patch(
                "app.services.email.email_fetch_service.AsyncSessionLocal", fake_uow
            ),
            patch(
                "app.services.email.email_fetch_service.email_queue_repo.claim_next_pending",
                new=AsyncMock(return_value=item),
            ),
            patch(
                "app.services.email.email_fetch_service.integration_repo.get_by_org_and_provider",
                new=AsyncMock(return_value=integration),
            ),
            patch(
                "app.services.email.email_fetch_service.integration_repo.mark_needs_reauth",
                new=fake_mark_needs_reauth,
            ),
            patch(
                "app.services.email.email_fetch_service.email_queue_repo.get_by_id",
                new=fake_get_by_id,
            ),
            patch(
                "app.services.email.email_fetch_service.email_queue_repo.mark_status",
                new=fake_mark_status,
            ),
            patch(
                "app.services.email.email_fetch_service._fail_sync_log_if_done",
                new=fake_fail_sync_log_if_done,
            ),
            patch(
                "app.services.email.email_fetch_service.get_gmail_service",
                return_value=(MagicMock(), MagicMock(token="t0")),
            ),
            patch(
                "app.services.email.email_fetch_service.fetch_attachment_bytes",
                side_effect=_make_fake_http_error(500),
            ),
        ):
            from app.services.email.email_fetch_service import _fetch_next_pending

            result = await _fetch_next_pending(ctx)

        assert result.status == "failed"
        assert mark_calls == [], "mark_needs_reauth must NOT be called for non-401 errors"
        assert integration.needs_reauth is False


# ---------------------------------------------------------------------------
# Fix 1: gmail_service send paths — set needs_reauth before raising
# ---------------------------------------------------------------------------

class TestSendPathNeedsReauth:
    """send_message and send_message_with_attachment must set needs_reauth."""

    def _make_send_integration(self, org_id: uuid.UUID) -> MagicMock:
        integration = MagicMock()
        integration.organization_id = org_id
        integration.access_token = "tok_access"
        integration.refresh_token = "tok_refresh"
        return integration

    def _gmail_service_patches(
        self,
        org_id: uuid.UUID,
        integration: MagicMock,
        mark_calls: list,
        send_side_effect: Exception,
    ):
        """Common patch stack for gmail_service send tests."""
        stale = MagicMock()
        stale.needs_reauth = False

        fake_db = MagicMock()

        @asynccontextmanager
        async def fake_uow():
            yield fake_db

        async def fake_get_by_org(db, oid, provider):
            return stale

        async def fake_mark_needs_reauth(db, integ, error, failed_at):
            mark_calls.append((integ, error, failed_at))
            integ.needs_reauth = True

        mock_service = MagicMock()
        mock_service.users.return_value.messages.return_value.send.return_value.execute.side_effect = send_side_effect

        return (
            patch("app.services.email.gmail_service.unit_of_work", fake_uow),
            patch(
                "app.services.email.gmail_service.integration_repo.get_by_org_and_provider",
                new=fake_get_by_org,
            ),
            patch(
                "app.services.email.gmail_service.integration_repo.mark_needs_reauth",
                new=fake_mark_needs_reauth,
            ),
            patch("app.services.email.gmail_service.get_gmail_service", return_value=(mock_service, MagicMock(token="t0"))),
            stale,
        )

    @pytest.mark.asyncio
    async def test_send_message_refresh_error_sets_needs_reauth(self) -> None:
        """send_message must set needs_reauth when RefreshError is raised."""
        org_id = uuid.uuid4()
        integration = self._make_send_integration(org_id)
        mark_calls: list = []

        patches = self._gmail_service_patches(
            org_id, integration, mark_calls, RefreshError("invalid_grant")
        )
        *ctx_patches, stale = patches

        with (
            ctx_patches[0],
            ctx_patches[1],
            ctx_patches[2],
            ctx_patches[3],
        ):
            from app.services.email.gmail_service import send_message

            with pytest.raises(GmailReauthRequiredError):
                await send_message(
                    integration,
                    from_address="host@example.com",
                    to_address="tenant@example.com",
                    subject="Test",
                    body="Hello",
                )

        assert len(mark_calls) == 1, "mark_needs_reauth must be called for RefreshError"
        assert stale.needs_reauth is True

    @pytest.mark.asyncio
    async def test_send_message_401_sets_needs_reauth(self) -> None:
        """send_message must set needs_reauth when HttpError 401 is raised."""
        org_id = uuid.uuid4()
        integration = self._make_send_integration(org_id)
        mark_calls: list = []

        patches = self._gmail_service_patches(
            org_id, integration, mark_calls, _make_fake_http_error(401)
        )
        *ctx_patches, stale = patches

        with (
            ctx_patches[0],
            ctx_patches[1],
            ctx_patches[2],
            ctx_patches[3],
        ):
            from app.services.email.gmail_service import send_message

            with pytest.raises(GmailReauthRequiredError):
                await send_message(
                    integration,
                    from_address="host@example.com",
                    to_address="tenant@example.com",
                    subject="Test",
                    body="Hello",
                )

        assert len(mark_calls) == 1, "mark_needs_reauth must be called for 401 HttpError"
        assert stale.needs_reauth is True

    @pytest.mark.asyncio
    async def test_send_message_with_attachment_refresh_error_sets_needs_reauth(self) -> None:
        """send_message_with_attachment must set needs_reauth on RefreshError."""
        org_id = uuid.uuid4()
        integration = self._make_send_integration(org_id)
        mark_calls: list = []

        patches = self._gmail_service_patches(
            org_id, integration, mark_calls, RefreshError("invalid_grant")
        )
        *ctx_patches, stale = patches

        with (
            ctx_patches[0],
            ctx_patches[1],
            ctx_patches[2],
            ctx_patches[3],
        ):
            from app.services.email.gmail_service import send_message_with_attachment

            with pytest.raises(GmailReauthRequiredError):
                await send_message_with_attachment(
                    integration,
                    from_address="host@example.com",
                    to_address="tenant@example.com",
                    subject="Receipt",
                    body="See attached",
                    attachment_bytes=b"%PDF",
                    attachment_filename="receipt.pdf",
                    attachment_content_type="application/pdf",
                )

        assert len(mark_calls) == 1
        assert stale.needs_reauth is True

    @pytest.mark.asyncio
    async def test_send_message_with_attachment_401_sets_needs_reauth(self) -> None:
        """send_message_with_attachment must set needs_reauth on HttpError 401."""
        org_id = uuid.uuid4()
        integration = self._make_send_integration(org_id)
        mark_calls: list = []

        patches = self._gmail_service_patches(
            org_id, integration, mark_calls, _make_fake_http_error(401)
        )
        *ctx_patches, stale = patches

        with (
            ctx_patches[0],
            ctx_patches[1],
            ctx_patches[2],
            ctx_patches[3],
        ):
            from app.services.email.gmail_service import send_message_with_attachment

            with pytest.raises(GmailReauthRequiredError):
                await send_message_with_attachment(
                    integration,
                    from_address="host@example.com",
                    to_address="tenant@example.com",
                    subject="Receipt",
                    body="See attached",
                    attachment_bytes=b"%PDF",
                    attachment_filename="receipt.pdf",
                    attachment_content_type="application/pdf",
                )

        assert len(mark_calls) == 1
        assert stale.needs_reauth is True
