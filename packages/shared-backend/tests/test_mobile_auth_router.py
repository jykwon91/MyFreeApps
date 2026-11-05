"""The shared ``/auth/mobile`` routes, with an app's dependencies replaced by fakes."""
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from platform_shared.api.mobile_auth_router import build_mobile_auth_router
from platform_shared.auth.refreshed_session import RefreshedSession
from platform_shared.core.refresh_session_limits import (
    MOBILE_ACCESS_TOKEN_SECONDS,
    REFRESH_ATTEMPTS_PER_SESSION,
)
from platform_shared.services.guard_outcome import GuardOutcome

_SECRET = "test-secret-key-that-is-long-enough-to-sign-with"
_LOGIN = {"email": "a@example.com", "password": "correct-password", "device_name": "Phone"}
_LOGIN_TIME = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _user(**overrides: Any) -> SimpleNamespace:
    fields = {
        "id": uuid.uuid4(),
        "email": _LOGIN["email"],
        "is_active": True,
        "is_verified": True,
        "totp_enabled": False,
    }
    return SimpleNamespace(**(fields | overrides))


def _session_row() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        device_name="Phone",
        auth_time=_LOGIN_TIME,
        created_at=_LOGIN_TIME,
        last_used_at=_LOGIN_TIME,
        current_secret_hash="must-never-be-returned",
    )


class _Harness:
    def __init__(self, user: SimpleNamespace | None = None) -> None:
        self.user = user or _user()
        self.db = AsyncMock(new=(), dirty=(), deleted=())
        self.row = _session_row()
        refreshed = RefreshedSession(user=self.user, session=self.row, refresh_token="new-refresh")
        self.sessions = MagicMock()
        self.sessions.issue = AsyncMock(return_value=refreshed)
        self.sessions.rotate = AsyncMock(return_value=refreshed)
        self.sessions.end = AsyncMock()
        self.sessions.list_active = AsyncMock(return_value=[self.row])
        self.sessions.revoke = AsyncMock(return_value=True)
        self.sessions.session_id_of = MagicMock(return_value=self.row.id)
        self.manager = MagicMock()
        self.manager.authenticate_password = AsyncMock(return_value=self.user)
        self.guard = MagicMock()
        self.guard.record_event = AsyncMock()
        self.guard.record_code_attempt = AsyncMock(return_value=GuardOutcome.ALLOWED)
        self.manager.account_guard = self.guard
        self.totp = SimpleNamespace(validate_totp_for_login=AsyncMock(return_value=(True, False)))

        async def current_active_user() -> SimpleNamespace:
            return self.user

        async def get_user_manager() -> AsyncIterator[MagicMock]:
            yield self.manager

        async def get_db() -> AsyncIterator[AsyncMock]:
            yield self.db

        app = FastAPI()
        app.include_router(
            build_mobile_auth_router(
                secret_key=_SECRET,
                session_service=self.sessions,
                current_active_user=current_active_user,
                get_user_manager=get_user_manager,
                get_db=get_db,
                totp_service=self.totp,
                login_dependencies=[],
            )
        )
        self.client = TestClient(app)

    def refresh(self) -> Any:
        return self.client.post("/auth/mobile/refresh", json={"refresh_token": "old-refresh"})


def _claims(token: str) -> dict[str, Any]:
    return jwt.decode(token, _SECRET, algorithms=["HS256"], audience="fastapi-users:auth")


def test_login_returns_both_tokens() -> None:
    harness = _Harness()
    response = harness.client.post("/auth/mobile/login", json=_LOGIN)
    assert response.status_code == 200
    body = response.json()
    assert body["refresh_token"] == "new-refresh"
    assert body["expires_in"] == MOBILE_ACCESS_TOKEN_SECONDS
    assert body["session_id"] == str(harness.row.id)
    assert "detail" not in body
    assert response.headers["cache-control"] == "no-store"
    harness.sessions.issue.assert_awaited_once()
    assert harness.sessions.issue.await_args.kwargs["device_name"] == "Phone"


def test_a_2fa_user_without_a_code_gets_no_session() -> None:
    harness = _Harness(_user(totp_enabled=True))
    response = harness.client.post("/auth/mobile/login", json=_LOGIN)
    assert response.status_code == 200
    assert response.json() == {"detail": "totp_required"}
    harness.sessions.issue.assert_not_awaited()


def test_a_wrong_2fa_code_gets_no_session_and_counts_toward_lockout() -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.totp.validate_totp_for_login.return_value = (False, False)
    harness.guard.record_code_attempt.return_value = GuardOutcome.WRONG
    response = harness.client.post("/auth/mobile/login", json=_LOGIN | {"totp_code": "000000"})
    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_totp"
    assert harness.guard.record_code_attempt.await_args.kwargs["valid"] is False
    harness.sessions.issue.assert_not_awaited()


@pytest.mark.parametrize(
    ("user", "detail"),
    [
        (_user(is_verified=False), "LOGIN_USER_NOT_VERIFIED"),
        (_user(is_active=False), "LOGIN_BAD_CREDENTIALS"),
    ],
    ids=["unverified", "inactive"],
)
def test_a_refused_login_gets_no_session(user: SimpleNamespace, detail: str) -> None:
    harness = _Harness(user)
    response = harness.client.post("/auth/mobile/login", json=_LOGIN)
    assert response.status_code == 400
    assert response.json()["detail"] == detail
    harness.sessions.issue.assert_not_awaited()


def test_a_bad_password_gets_no_session() -> None:
    harness = _Harness()
    harness.manager.authenticate_password.return_value = None
    response = harness.client.post("/auth/mobile/login", json=_LOGIN)
    assert response.status_code == 400
    harness.sessions.issue.assert_not_awaited()


def test_a_refreshed_access_token_keeps_the_login_time() -> None:
    harness = _Harness()
    response = harness.refresh()
    assert response.status_code == 200
    claims = _claims(response.json()["access_token"])
    assert claims["auth_time"] == int(_LOGIN_TIME.timestamp())
    assert claims["iat"] > claims["auth_time"]
    assert claims["exp"] - claims["iat"] == MOBILE_ACCESS_TOKEN_SECONDS
    assert claims["sub"] == str(harness.user.id)
    assert response.headers["cache-control"] == "no-store"


def test_a_refused_refresh_is_told_to_sign_out() -> None:
    harness = _Harness()
    harness.sessions.rotate.return_value = None
    response = harness.refresh()
    assert response.status_code == 401
    assert response.json()["detail"] == "refresh_invalid"


def test_a_token_we_did_not_issue_is_refused_without_touching_the_database() -> None:
    harness = _Harness()
    harness.sessions.session_id_of.return_value = None
    response = harness.refresh()
    assert response.status_code == 401
    assert response.json()["detail"] == "refresh_invalid"
    harness.sessions.rotate.assert_not_awaited()


def test_going_over_the_session_limit_gets_429_and_never_rotates() -> None:
    harness = _Harness()
    for _ in range(REFRESH_ATTEMPTS_PER_SESSION):
        assert harness.refresh().status_code == 200
    rotations = harness.sessions.rotate.await_count

    response = harness.refresh()
    assert response.status_code == 429
    assert harness.sessions.rotate.await_count == rotations


def test_logout_ends_the_session_and_needs_no_access_token() -> None:
    harness = _Harness()
    response = harness.client.post("/auth/mobile/logout", json={"refresh_token": "old-refresh"})
    assert response.status_code == 204
    harness.sessions.end.assert_awaited_once()


def test_the_device_list_leaves_out_secrets() -> None:
    harness = _Harness()
    response = harness.client.get("/auth/mobile/sessions")
    assert response.status_code == 200
    assert set(response.json()[0]) == {"id", "device_name", "created_at", "last_used_at"}


def test_revoking_is_scoped_to_the_signed_in_user() -> None:
    harness = _Harness()
    session_id = uuid.uuid4()
    assert harness.client.delete(f"/auth/mobile/sessions/{session_id}").status_code == 204
    assert harness.sessions.revoke.await_args.args == (harness.user.id, session_id)


def test_revoking_a_session_that_isnt_theirs_is_404() -> None:
    harness = _Harness()
    harness.sessions.revoke.return_value = False
    assert harness.client.delete(f"/auth/mobile/sessions/{uuid.uuid4()}").status_code == 404


def test_an_oversized_password_is_refused_before_hashing() -> None:
    harness = _Harness()
    response = harness.client.post("/auth/mobile/login", json=_LOGIN | {"password": "x" * 1025})
    assert response.status_code == 422
    harness.manager.authenticate_password.assert_not_awaited()
