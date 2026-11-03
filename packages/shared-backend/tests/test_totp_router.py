"""The shared ``/auth/totp`` routes, with an app's dependencies replaced by fakes."""
import uuid
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from platform_shared.api.totp_router import build_totp_router
from platform_shared.core.auth_events import AuthEventType

LOGIN = {"email": "a@example.com", "password": "correct-password"}


def _user(**overrides: Any) -> SimpleNamespace:
    fields = {
        "id": uuid.uuid4(),
        "email": LOGIN["email"],
        "is_active": True,
        "is_verified": True,
        "totp_enabled": False,
    }
    return SimpleNamespace(**(fields | overrides))


class _Harness:
    """A client for the router, plus everything it was given."""

    def __init__(self, user: SimpleNamespace | None, *login_dependencies: Any) -> None:
        self.user = user
        self.db = AsyncMock()
        self.service = SimpleNamespace(
            setup_totp=AsyncMock(return_value=("secret", "otpauth://uri")),
            confirm_totp=AsyncMock(return_value=(True, ["code-1"])),
            disable_totp=AsyncMock(return_value=True),
            validate_totp_for_login=AsyncMock(return_value=(True, False)),
        )
        self.manager = MagicMock()
        self.manager.authenticate_password = AsyncMock(return_value=user)
        self.manager.count_failed_second_factor = AsyncMock()
        self.manager.clear_failed_logins = AsyncMock()
        self.strategy = MagicMock()
        self.strategy.write_token = AsyncMock(return_value="a-token")

        async def current_active_user() -> SimpleNamespace | None:
            return self.user

        async def get_user_manager() -> AsyncIterator[MagicMock]:
            yield self.manager

        async def get_db() -> AsyncIterator[AsyncMock]:
            yield self.db

        app = FastAPI()
        app.include_router(
            build_totp_router(
                current_active_user=current_active_user,
                get_user_manager=get_user_manager,
                get_db=get_db,
                get_jwt_strategy=lambda: self.strategy,
                totp_service=self.service,
                login_dependencies=list(login_dependencies),
            )
        )
        self.client = TestClient(app)


@pytest.fixture
def events() -> Any:
    with patch("platform_shared.api.totp_router.log_auth_event", new=AsyncMock()) as logged:
        yield logged


def _logged_types(events: AsyncMock) -> list[AuthEventType]:
    return [call.kwargs["event_type"] for call in events.await_args_list]


def test_user_without_2fa_gets_a_token(events: AsyncMock) -> None:
    harness = _Harness(_user())

    resp = harness.client.post("/auth/totp/login", json=LOGIN)

    assert resp.status_code == 200
    assert resp.json() == {"access_token": "a-token", "token_type": "bearer"}
    assert _logged_types(events) == [AuthEventType.LOGIN_SUCCESS]
    harness.db.commit.assert_awaited()


def test_credentials_reach_the_manager_as_username_and_password(events: AsyncMock) -> None:
    harness = _Harness(_user())

    harness.client.post("/auth/totp/login", json=LOGIN)

    credentials = harness.manager.authenticate_password.await_args.args[0]
    assert (credentials.username, credentials.password) == (LOGIN["email"], LOGIN["password"])


def test_user_with_2fa_and_no_code_is_asked_for_one_and_gets_no_token(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))

    resp = harness.client.post("/auth/totp/login", json=LOGIN)

    assert resp.status_code == 200
    assert resp.json() == {"detail": "totp_required"}
    harness.strategy.write_token.assert_not_awaited()
    harness.manager.clear_failed_logins.assert_not_awaited()
    harness.manager.count_failed_second_factor.assert_not_awaited()


def test_correct_code_gets_a_token(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))

    resp = harness.client.post("/auth/totp/login", json=LOGIN | {"totp_code": "123456"})

    assert resp.json()["access_token"] == "a-token"
    harness.service.validate_totp_for_login.assert_awaited_once_with(LOGIN["email"], "123456")
    assert _logged_types(events) == [AuthEventType.TOTP_VERIFY_SUCCESS, AuthEventType.LOGIN_SUCCESS]
    harness.manager.clear_failed_logins.assert_awaited_once_with(harness.user)
    harness.manager.count_failed_second_factor.assert_not_awaited()


def test_recovery_code_is_logged_as_one(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.service.validate_totp_for_login.return_value = (True, True)

    harness.client.post("/auth/totp/login", json=LOGIN | {"totp_code": "12345678"})

    assert _logged_types(events)[0] == AuthEventType.TOTP_RECOVERY_USED


def test_wrong_code_gets_no_token(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.service.validate_totp_for_login.return_value = (False, False)

    resp = harness.client.post("/auth/totp/login", json=LOGIN | {"totp_code": "000000"})

    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid_totp"
    assert _logged_types(events) == [AuthEventType.TOTP_VERIFY_FAILURE]
    harness.manager.count_failed_second_factor.assert_awaited_once_with(harness.user)
    harness.manager.clear_failed_logins.assert_not_awaited()
    harness.strategy.write_token.assert_not_awaited()
    harness.db.commit.assert_awaited()


@pytest.mark.parametrize(
    "user, detail, event, reason",
    [
        (None, "LOGIN_BAD_CREDENTIALS", AuthEventType.LOGIN_FAILURE, "bad_credentials"),
        (_user(is_active=False), "LOGIN_BAD_CREDENTIALS", AuthEventType.LOGIN_FAILURE, "account_inactive"),
        (_user(is_verified=False), "LOGIN_USER_NOT_VERIFIED", AuthEventType.LOGIN_BLOCKED_UNVERIFIED, None),
    ],
    ids=["bad password", "inactive", "unverified"],
)
def test_refused_logins_get_no_token_and_are_recorded(
    events: AsyncMock,
    user: SimpleNamespace | None,
    detail: str,
    event: AuthEventType,
    reason: str | None,
) -> None:
    harness = _Harness(user)

    resp = harness.client.post("/auth/totp/login", json=LOGIN)

    assert resp.status_code == 400
    assert resp.json()["detail"] == detail
    assert _logged_types(events) == [event]
    assert (events.await_args.kwargs.get("metadata") or {}).get("reason") == reason
    harness.strategy.write_token.assert_not_awaited()
    harness.db.commit.assert_awaited()


def test_login_runs_the_checks_it_was_given(events: AsyncMock) -> None:
    async def refuse() -> None:
        raise HTTPException(status_code=429, detail="too many")

    harness = _Harness(_user(), Depends(refuse))

    resp = harness.client.post("/auth/totp/login", json=LOGIN)

    assert resp.status_code == 429
    harness.manager.authenticate_password.assert_not_awaited()


def test_login_checks_dont_apply_to_other_routes(events: AsyncMock) -> None:
    async def refuse() -> None:
        raise HTTPException(status_code=429, detail="too many")

    harness = _Harness(_user(), Depends(refuse))

    assert harness.client.get("/auth/totp/status").json() == {"enabled": False}


def test_setup_is_refused_when_already_enabled(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))

    assert harness.client.post("/auth/totp/setup").status_code == 400
    harness.service.setup_totp.assert_not_awaited()


def test_setup_returns_the_secret(events: AsyncMock) -> None:
    resp = _Harness(_user()).client.post("/auth/totp/setup")

    assert resp.json() == {"secret": "secret", "provisioning_uri": "otpauth://uri"}


def test_verify_returns_recovery_codes_and_commits_the_event(events: AsyncMock) -> None:
    harness = _Harness(_user())

    resp = harness.client.post("/auth/totp/verify", json={"code": "123456"})

    assert resp.json() == {"verified": True, "recovery_codes": ["code-1"]}
    assert _logged_types(events) == [AuthEventType.TOTP_ENABLED]
    harness.db.commit.assert_awaited()


def test_wrong_verify_code_enables_nothing(events: AsyncMock) -> None:
    harness = _Harness(_user())
    harness.service.confirm_totp.return_value = (False, [])

    assert harness.client.post("/auth/totp/verify", json={"code": "000000"}).status_code == 400
    assert _logged_types(events) == []


def test_disable_commits_the_event(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))

    resp = harness.client.post("/auth/totp/disable", json={"code": "123456"})

    assert resp.json() == {"disabled": True}
    assert _logged_types(events) == [AuthEventType.TOTP_DISABLED]
    harness.db.commit.assert_awaited()


def test_wrong_disable_code_disables_nothing(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.service.disable_totp.return_value = False

    assert harness.client.post("/auth/totp/disable", json={"code": "000000"}).status_code == 400
    assert _logged_types(events) == []


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef"])
def test_verify_only_accepts_six_digits(events: AsyncMock, code: str) -> None:
    harness = _Harness(_user())

    assert harness.client.post("/auth/totp/verify", json={"code": code}).status_code == 422
    harness.service.confirm_totp.assert_not_awaited()
