"""A queue item whose download failed stores fixed copy, never the error's text.

``email_queue.error`` and the sync log's ``error`` are shown in the Sync
Sessions panel. Google's and the libraries' text is logged instead. A Gmail
connection's ``last_reauth_error`` is returned by the integrations API, so a
row flagged before it held fixed copy is shown as the generic line.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError

from app.core.context import RequestContext
from app.mappers.integration_mapper import displayable_reauth_error, to_integration_info
from app.models.organization.organization_member import OrgRole
from app.services.email import email_fetch_service
from app.services.email.constants import (
    GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR,
    GMAIL_FETCH_FAILED_ERROR,
    GMAIL_SCOPE_MISSING_SYNC_LOG_ERROR,
)

MODULE = "app.services.email.email_fetch_service"
RAW = "raw-library-text-https://gmail.googleapis.com/gmail/v1/users/me/messages/abc"


def _http_error(status: int) -> HttpError:
    return HttpError(MagicMock(status=status, reason="Bad Request"), RAW.encode())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure",
    [
        pytest.param(RuntimeError(RAW), id="unexpected"),
        pytest.param(_http_error(400), id="http-other"),
        pytest.param(RefreshError(f"invalid_client: {RAW}"), id="refresh-other"),
    ],
)
async def test_failed_download_stores_fixed_copy(failure: Exception, caplog: pytest.LogCaptureFixture) -> None:
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    item = MagicMock(id=uuid.uuid4(), message_id="m1", sync_log_id=1, attachment_id="att")
    integration = MagicMock(access_token="tok", refresh_token="rt")
    fail_sync_log = AsyncMock()

    @asynccontextmanager
    async def fake_session():
        yield MagicMock()

    async def fake_mark_status(_db, item_ref, status, *, error=None):
        item_ref.status = status
        item_ref.error = error

    with (
        patch(f"{MODULE}.unit_of_work", fake_session),
        patch(f"{MODULE}.AsyncSessionLocal", fake_session),
        patch(f"{MODULE}.email_queue_repo.claim_next_pending", AsyncMock(return_value=item)),
        patch(f"{MODULE}.email_queue_repo.get_by_id", AsyncMock(return_value=item)),
        patch(f"{MODULE}.email_queue_repo.mark_status", fake_mark_status),
        patch(f"{MODULE}.integration_repo.get_by_org_and_provider", AsyncMock(return_value=integration)),
        patch(f"{MODULE}._fail_sync_log_if_done", fail_sync_log),
        patch(f"{MODULE}.get_gmail_service", return_value=(MagicMock(), MagicMock(token="t0"))),
        patch(f"{MODULE}.fetch_attachment_bytes", side_effect=failure),
    ):
        result = await email_fetch_service._fetch_next_pending(ctx)

    assert result.error == GMAIL_FETCH_FAILED_ERROR
    assert item.status == "failed"
    assert item.error == GMAIL_FETCH_FAILED_ERROR
    assert fail_sync_log.await_args.args[2] == GMAIL_FETCH_FAILED_ERROR
    assert RAW in caplog.text


@pytest.mark.parametrize("stored", [None, "", GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR, GMAIL_SCOPE_MISSING_SYNC_LOG_ERROR])
def test_fixed_reauth_reasons_are_shown_as_stored(stored: str | None) -> None:
    assert displayable_reauth_error(stored) == stored


@pytest.mark.parametrize(
    "legacy",
    [
        "RefreshError('invalid_grant: Token has been expired or revoked.', {'error': 'invalid_grant'})",
        f"HttpError 403: <HttpError 403 when requesting {RAW} returned \"Insufficient Permission\">",
        "Gmail send returned 401",
    ],
)
def test_legacy_reauth_text_is_shown_as_the_generic_line(legacy: str) -> None:
    integration = MagicMock(provider="gmail", needs_reauth=True, last_reauth_error=legacy, metadata_={})

    info = to_integration_info(integration, has_send_scope=True)

    assert info["last_reauth_error"] == GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR
    assert integration.last_reauth_error == legacy
