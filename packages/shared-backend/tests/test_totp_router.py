"""The shared ``/auth/totp`` routes, with an app's dependencies replaced by fakes."""
import hashlib
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pyotp
import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from platform_shared.api.totp_router import build_totp_router
from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.totp_already_enabled_error import TotpAlreadyEnabledError
from platform_shared.services.totp_service import (
    DEFAULT_TOTP_ALGORITHM,
    TOTP_DIGITS,
    TOTP_PERIOD_SECONDS,
    generate_secret,
    matching_time_step,
)

LOGIN = {"email": "a@example.com", "password": "correct-password"}


def _user(**overrides: Any) -> SimpleNamespace:
    fields = {
        "id": uuid.uuid4(),
        "email": LOGIN["email"],
        "is_active": True,
        "is_verified": True,
        "totp_enabled": False,
        "locked_until": None,
        "failed_login_count": 0,
        "last_failed_login_at": None,
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
        self.manager.is_locked_now = AsyncMock(return_value=False)
        self.manager.count_failed_second_factor = AsyncMock()
        self.manager.clear_failed_logins = AsyncMock()
        self.manager.reset_stale_failed_logins = AsyncMock()
        self.manager.totp_enabled_now = AsyncMock(return_value=True)
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
    logged = AsyncMock()
    with (
        patch("platform_shared.api.totp_router.log_auth_event", new=logged),
        patch("platform_shared.auth.refuse_as_locked.emit_locked_login_event", new=AsyncMock()),
        patch("platform_shared.auth.verified_login.log_auth_event", new=logged),
    ):
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

    assert resp.json() == {
        "secret": "secret",
        "provisioning_uri": "otpauth://uri",
        "algorithm": "sha256",
        "digits": 6,
        "period": 30,
    }


def test_the_settings_setup_reports_are_the_ones_codes_use() -> None:
    secret = generate_secret()
    code = pyotp.TOTP(
        secret, digits=TOTP_DIGITS, interval=TOTP_PERIOD_SECONDS, digest=hashlib.sha256,
    ).now()

    assert matching_time_step(secret, code, algorithm=DEFAULT_TOTP_ALGORITHM, after_step=None) is not None


def test_setup_racing_a_verify_is_refused(events: AsyncMock) -> None:
    harness = _Harness(_user())
    harness.service.setup_totp.side_effect = TotpAlreadyEnabledError

    assert harness.client.post("/auth/totp/setup").status_code == 400


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


def test_verify_is_refused_when_already_enabled_and_keeps_the_recovery_codes(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))

    assert harness.client.post("/auth/totp/verify", json={"code": "123456"}).status_code == 400
    harness.service.confirm_totp.assert_not_awaited()


def test_disable_commits_the_event(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))

    resp = harness.client.post("/auth/totp/disable", json={"code": "123456"})

    assert resp.json() == {"disabled": True}
    assert _logged_types(events) == [AuthEventType.TOTP_DISABLED]
    harness.db.commit.assert_awaited()


def test_right_disable_code_clears_the_failure_count(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))

    assert harness.client.post("/auth/totp/disable", json={"code": "123456"}).status_code == 200
    harness.manager.clear_failed_logins.assert_awaited_once()


def test_double_press_on_disable_counts_nothing(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.service.disable_totp.return_value = False
    harness.manager.totp_enabled_now.return_value = False

    resp = harness.client.post("/auth/totp/disable", json={"code": "123456"})

    assert (resp.status_code, resp.json()["detail"]) == (400, "2FA is not enabled")
    harness.manager.count_failed_second_factor.assert_not_awaited()


def test_wrong_disable_code_disables_nothing(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.service.disable_totp.return_value = False

    assert harness.client.post("/auth/totp/disable", json={"code": "000000"}).status_code == 400
    assert _logged_types(events) == [AuthEventType.TOTP_VERIFY_FAILURE]
    harness.manager.count_failed_second_factor.assert_awaited_once()
    harness.db.commit.assert_awaited()


def test_disable_when_off_is_told_so_and_counts_nothing(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=False))

    resp = harness.client.post("/auth/totp/disable", json={"code": "123456"})

    assert (resp.status_code, resp.json()["detail"]) == (400, "2FA is not enabled")
    harness.service.disable_totp.assert_not_awaited()
    harness.manager.count_failed_second_factor.assert_not_awaited()


def test_disable_on_a_locked_account_checks_no_code(events: AsyncMock) -> None:
    locked = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
    harness = _Harness(_user(totp_enabled=True, locked_until=locked))

    assert harness.client.post("/auth/totp/disable", json={"code": "123456"}).status_code == 429
    harness.service.disable_totp.assert_not_awaited()


def test_disable_guess_that_arrives_after_a_lock_gets_the_lock_answer(events: AsyncMock) -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.service.disable_totp.return_value = False
    harness.manager.is_locked_now.return_value = True

    assert harness.client.post("/auth/totp/disable", json={"code": "000000"}).status_code == 429
    harness.manager.count_failed_second_factor.assert_not_awaited()


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef"])
def test_verify_only_accepts_six_digits(events: AsyncMock, code: str) -> None:
    harness = _Harness(_user())

    assert harness.client.post("/auth/totp/verify", json={"code": code}).status_code == 422
    harness.service.confirm_totp.assert_not_awaited()


@pytest.mark.parametrize("code_is_right", [True, False], ids=["right", "wrong"])
def test_a_lock_from_codes_sent_together_stops_this_one_too(events: AsyncMock, code_is_right: bool) -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.manager.is_locked_now.return_value = True
    harness.service.validate_totp_for_login.return_value = (code_is_right, False)

    resp = harness.client.post("/auth/totp/login", json=LOGIN | {"totp_code": "000000"})

    assert resp.status_code == 400
    assert resp.json()["detail"] == "LOGIN_BAD_CREDENTIALS"
    harness.manager.count_failed_second_factor.assert_not_awaited()
    harness.manager.clear_failed_logins.assert_not_awaited()
    harness.strategy.write_token.assert_not_awaited()
