"""The lockout check on JSON logins refuses locked accounts and ignores bad bodies."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from platform_shared.core.auth_events import AuthEventType
from platform_shared.core.rate_limit import make_check_json_login_not_locked


def _request(body: bytes) -> Request:
    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": body, "more_body": False}

    return Request({"type": "http", "method": "POST", "headers": [], "path": "/"}, receive)


@pytest.mark.parametrize(
    "body",
    [b"", b"{truncated", b"[1, 2]", b'"text"', b'{"email": 7}', b'{"email": ""}', b"\xff\xfe"],
    ids=["empty", "truncated", "list", "scalar", "number", "blank", "not-utf8"],
)
@pytest.mark.asyncio
async def test_a_body_naming_no_account_passes_through_to_validation(body: bytes) -> None:
    lookup = AsyncMock()
    await make_check_json_login_not_locked(lookup)(_request(body), MagicMock())
    lookup.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_locked_account_is_refused_and_recorded() -> None:
    user = SimpleNamespace(id="user", locked_until=datetime.now(timezone.utc) + timedelta(hours=1))
    db = MagicMock(commit=AsyncMock())
    with patch("platform_shared.core.rate_limit.log_auth_event", AsyncMock()) as logged:
        with pytest.raises(HTTPException) as refused:
            await make_check_json_login_not_locked(AsyncMock(return_value=user))(
                _request(b'{"email": "a@example.com"}'), db,
            )
    assert refused.value.status_code == 429
    assert logged.await_args.kwargs["event_type"] == AuthEventType.LOGIN_BLOCKED_LOCKED
    db.commit.assert_awaited_once()


@pytest.mark.parametrize(
    "user",
    [None, SimpleNamespace(id="user", locked_until=None)],
    ids=["unknown", "not-locked"],
)
@pytest.mark.asyncio
async def test_an_account_that_isnt_locked_passes(user: Any) -> None:
    await make_check_json_login_not_locked(AsyncMock(return_value=user))(
        _request(b'{"email": "a@example.com"}'), MagicMock(),
    )
