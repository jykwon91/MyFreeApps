"""A Google outage or rate limit never flags a Gmail connection as needing reconnect."""
from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError

from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole
from app.services.email import email_fetch_service, gmail_read_executor, gmail_request_executor
from app.services.email.constants import (
    GMAIL_MESSAGE_GONE_ERROR,
    GMAIL_SCOPE_MISSING_SYNC_LOG_ERROR,
    GMAIL_TEMPORARILY_UNAVAILABLE_SYNC_LOG_ERROR,
)
from app.services.email.exceptions import (
    GmailReauthRequiredError,
    GmailSendError,
    GmailTemporarilyUnavailableError,
)
from tests.gmail_send_fakes import fake_gmail_post

OUTAGE = RefreshError("server_error", {"error": "server_error"}, retryable=True)


def _http_error(status: int, reason: str | None = None) -> HttpError:
    body = {"error": {"code": status, "errors": [{"reason": reason}] if reason else []}}
    return HttpError(MagicMock(status=status, reason="x"), json.dumps(body).encode())


# -- reads and sends ---------------------------------------------------------


@pytest.fixture
def read(monkeypatch: pytest.MonkeyPatch) -> dict[str, MagicMock]:
    request = MagicMock()
    monkeypatch.setattr(
        gmail_read_executor, "get_gmail_service", MagicMock(return_value=(MagicMock(), MagicMock(token="t"))),
    )
    mark = AsyncMock()
    monkeypatch.setattr(gmail_read_executor, "mark_integration_needs_reauth", mark)
    monkeypatch.setattr(gmail_read_executor, "persist_refreshed_token", AsyncMock())
    return {"request": request, "mark": mark}


async def _read(read: dict[str, MagicMock]) -> dict[str, object]:
    return await gmail_read_executor.execute_gmail_read(
        MagicMock(access_token="a", refresh_token="r"), lambda _s: read["request"], purpose="send receipts",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure",
    [OUTAGE, _http_error(429), _http_error(503), _http_error(403, "rateLimitExceeded"), _http_error(404)],
    ids=["token-endpoint-outage", "429", "503", "403-rate-limit", "404"],
)
async def test_read_failures_that_are_not_a_revoked_token_do_not_flag_the_connection(read, failure) -> None:
    read["request"].execute.side_effect = failure

    with pytest.raises(type(failure)):
        await _read(read)

    read["mark"].assert_not_awaited()


@pytest.mark.asyncio
async def test_read_403_for_a_missing_scope_asks_for_a_reconnect(read) -> None:
    read["request"].execute.side_effect = _http_error(403, "insufficientPermissions")

    with pytest.raises(GmailReauthRequiredError, match="permission missing"):
        await _read(read)

    read["mark"].assert_awaited_once()


@pytest.mark.asyncio
async def test_send_during_a_token_endpoint_outage_is_a_retryable_send_error_not_a_reconnect() -> None:
    mark = AsyncMock()
    integration = MagicMock(access_token="a", refresh_token="r")
    with (
        patch.object(gmail_request_executor, "mark_integration_needs_reauth", mark),
        fake_gmail_post(OUTAGE),
    ):
        with pytest.raises(GmailSendError) as raised:
            await gmail_request_executor.send_raw_gmail_message(integration, "raw", purpose="send receipts")

    assert not isinstance(raised.value, GmailReauthRequiredError)
    mark.assert_not_awaited()


# -- fetching queue items ----------------------------------------------------


@pytest.fixture
def fetch(monkeypatch: pytest.MonkeyPatch) -> dict[str, object]:
    org_id = uuid.uuid4()
    item = MagicMock(id=uuid.uuid4(), message_id="m1", sync_log_id=1, attachment_id="att", status="pending")
    integration = MagicMock(access_token="a", refresh_token="r", needs_reauth=False)
    marks: list[str] = []
    reauth_marks: list[str] = []

    @asynccontextmanager
    async def uow():
        yield MagicMock()

    async def mark_status(_db, ref, status, *, error=None):
        ref.status = status
        ref.error = error
        marks.append(status)

    async def mark_reauth(_db, _integration, reason, _when):
        reauth_marks.append(reason)
        return True

    base = "app.services.email.email_fetch_service"
    for target, value in {
        f"{base}.unit_of_work": uow,
        f"{base}.AsyncSessionLocal": uow,
        f"{base}.email_queue_repo.claim_next_pending": AsyncMock(return_value=item),
        f"{base}.email_queue_repo.get_by_id": AsyncMock(return_value=item),
        f"{base}.email_queue_repo.mark_status": mark_status,
        f"{base}.email_queue_repo.store_fetched_content": AsyncMock(),
        f"{base}.integration_repo.get_by_org_and_provider": AsyncMock(return_value=integration),
        f"{base}.integration_repo.mark_needs_reauth_if_unchanged": mark_reauth,
        f"{base}._fail_sync_log_if_done": AsyncMock(),
        f"{base}._complete_sync_log_if_done": AsyncMock(),
        f"{base}.get_gmail_service": MagicMock(return_value=(MagicMock(), MagicMock(token="t0"))),
        f"{base}.strip_photo_metadata": lambda b: b,
    }.items():
        monkeypatch.setattr(target, value)
    ctx = RequestContext(organization_id=org_id, user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    return {"ctx": ctx, "item": item, "marks": marks, "reauth_marks": reauth_marks, "mp": monkeypatch}


def _fetch_raises(fetch: dict[str, object], failure: Exception) -> None:
    fetch["mp"].setattr(email_fetch_service, "fetch_attachment_bytes", MagicMock(side_effect=failure))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure",
    [OUTAGE, _http_error(503), _http_error(429), _http_error(403, "userRateLimitExceeded")],
    ids=["token-endpoint-outage", "503", "429", "403-rate-limit"],
)
async def test_a_google_outage_leaves_the_item_pending_and_the_connection_alone(fetch, failure) -> None:
    _fetch_raises(fetch, failure)

    with pytest.raises(GmailTemporarilyUnavailableError):
        await email_fetch_service._fetch_next_pending(fetch["ctx"])

    assert fetch["marks"] == []
    assert fetch["item"].status == "pending"
    assert fetch["reauth_marks"] == []


@pytest.mark.asyncio
async def test_a_deleted_message_fails_only_that_item_with_a_clear_reason(fetch) -> None:
    _fetch_raises(fetch, _http_error(404))

    result = await email_fetch_service._fetch_next_pending(fetch["ctx"])

    assert (result.status, result.error) == ("failed", GMAIL_MESSAGE_GONE_ERROR)
    assert fetch["item"].error == GMAIL_MESSAGE_GONE_ERROR
    assert fetch["reauth_marks"] == []


@pytest.mark.asyncio
async def test_a_missing_scope_asks_for_a_reconnect(fetch) -> None:
    _fetch_raises(fetch, _http_error(403, "insufficientPermissions"))

    with pytest.raises(GmailReauthRequiredError):
        await email_fetch_service._fetch_next_pending(fetch["ctx"])

    assert len(fetch["reauth_marks"]) == 1
    assert fetch["item"].error == GMAIL_SCOPE_MISSING_SYNC_LOG_ERROR


@pytest.mark.asyncio
async def test_a_revoked_grant_still_asks_for_a_reconnect(fetch) -> None:
    _fetch_raises(fetch, RefreshError("invalid_grant", {"error": "invalid_grant"}))

    with pytest.raises(GmailReauthRequiredError):
        await email_fetch_service._fetch_next_pending(fetch["ctx"])

    assert len(fetch["reauth_marks"]) == 1


@pytest.mark.asyncio
async def test_a_permanent_non_revocation_refresh_failure_fails_the_item_without_a_reconnect_prompt(fetch) -> None:
    _fetch_raises(fetch, RefreshError("invalid_client", {"error": "invalid_client"}))

    result = await email_fetch_service._fetch_next_pending(fetch["ctx"])

    assert result.status == "failed"
    assert fetch["reauth_marks"] == []


@pytest.mark.asyncio
async def test_failing_to_save_a_refreshed_token_does_not_fail_an_item_that_was_stored(fetch) -> None:
    fetch["mp"].setattr(email_fetch_service, "fetch_attachment_bytes", MagicMock(return_value=b"bytes"))
    fetch["mp"].setattr(
        email_fetch_service, "persist_refreshed_token", AsyncMock(side_effect=RuntimeError("db down")),
    )

    result = await email_fetch_service._fetch_next_pending(fetch["ctx"])

    assert result.status == "fetched"
    assert "failed" not in fetch["marks"]


@pytest.mark.asyncio
async def test_the_drain_stops_without_a_reconnect_prompt_and_fails_the_running_sync_log(fetch) -> None:
    _fetch_raises(fetch, _http_error(503))
    failed_logs: list[tuple[int | None, str]] = []

    async def fail_log(sync_log_id, error):
        failed_logs.append((sync_log_id, error))

    fetch["mp"].setattr(email_fetch_service, "_fail_running_sync_log", fail_log)
    fetch["mp"].setattr(email_fetch_service.sync_log_repo, "is_cancelled", AsyncMock(return_value=False))

    await email_fetch_service.drain_gmail_fetch(fetch["ctx"], sync_log_id=7)

    assert failed_logs == [(7, GMAIL_TEMPORARILY_UNAVAILABLE_SYNC_LOG_ERROR)]
    assert fetch["reauth_marks"] == []
    assert fetch["marks"] == []
