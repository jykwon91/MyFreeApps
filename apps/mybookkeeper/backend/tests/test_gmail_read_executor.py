"""Shared auth handling for one Gmail read on a stored connection."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError

from app.services.email import gmail_read_executor
from app.services.email.constants import GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR, GMAIL_SCOPE_MISSING_SYNC_LOG_ERROR
from app.services.email.exceptions import GmailReauthRequiredError


def _http_error(status: int) -> HttpError:
    return HttpError(MagicMock(status=status, reason="x"), b"{}")


@pytest.fixture
def gmail(monkeypatch: pytest.MonkeyPatch) -> dict[str, MagicMock]:
    request = MagicMock()
    creds = MagicMock(token="old")
    monkeypatch.setattr(gmail_read_executor, "get_gmail_service", MagicMock(return_value=(MagicMock(), creds)))
    mark = AsyncMock()
    persist = AsyncMock()
    monkeypatch.setattr(gmail_read_executor, "mark_integration_needs_reauth", mark)
    monkeypatch.setattr(gmail_read_executor, "persist_refreshed_token", persist)
    return {"request": request, "creds": creds, "mark": mark, "persist": persist}


async def _read(gmail: dict[str, MagicMock]) -> dict[str, object]:
    integration = MagicMock(access_token="tok", refresh_token="rt")
    return await gmail_read_executor.execute_gmail_read(
        integration, lambda _service: gmail["request"], purpose="send receipts",
    )


@pytest.mark.asyncio
async def test_success_returns_the_response_and_saves_a_refreshed_token(gmail) -> None:
    gmail["request"].execute.return_value = {"emailAddress": "a@gmail.com"}

    assert await _read(gmail) == {"emailAddress": "a@gmail.com"}

    gmail["persist"].assert_awaited_once()
    assert gmail["persist"].await_args.args[1:] == (gmail["creds"], "old")
    gmail["mark"].assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "reason"),
    [
        (RefreshError("invalid_grant: Token has been expired or revoked."), GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR),
        (_http_error(401), GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR),
        (_http_error(403), GMAIL_SCOPE_MISSING_SYNC_LOG_ERROR),
    ],
)
async def test_refused_token_marks_reauth_and_names_the_purpose(gmail, failure, reason) -> None:
    gmail["request"].execute.side_effect = failure

    with pytest.raises(GmailReauthRequiredError, match="send receipts"):
        await _read(gmail)

    gmail["mark"].assert_awaited_once()
    # Fixed copy, not Google's text: the integration API returns this reason.
    assert gmail["mark"].await_args.args[1] == reason
    gmail["persist"].assert_not_awaited()


@pytest.mark.asyncio
async def test_other_failures_propagate_without_marking_reauth(gmail) -> None:
    gmail["request"].execute.side_effect = _http_error(500)

    with pytest.raises(HttpError):
        await _read(gmail)

    gmail["mark"].assert_not_awaited()
