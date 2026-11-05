"""The shared ``/auth/totp`` routes, with an app's dependencies replaced by fakes."""
import hashlib
import uuid
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pyotp
import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from platform_shared.api.totp_router import build_totp_router
from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.guard_outcome import GuardOutcome
from platform_shared.services.totp_already_enabled_error import TotpAlreadyEnabledError
from platform_shared.services.totp_service import (
    DEFAULT_TOTP_ALGORITHM,
    TOTP_DIGITS,
    TOTP_PERIOD_SECONDS,
    generate_secret,
    matching_time_step,
)

LOGIN = {"email": "a@example.com", "password": "correct-password"}


PASSWORD = "correct-password"


def _user(**overrides: Any) -> SimpleNamespace:
    fields = {
        "id": uuid.uuid4(),
        "email": LOGIN["email"],
        "is_active": True,
        "is_verified": True,
        "totp_enabled": False,
        "hashed_password": "stored-hash",
    }
    return SimpleNamespace(**(fields | overrides))


class _Harness:
    """A client for the router, plus everything it was given."""

    def __init__(self, user: SimpleNamespace | None, *login_dependencies: Any) -> None:
        self.user = user
        self.db = AsyncMock(new=(), dirty=(), deleted=())
        self.service = SimpleNamespace(
            setup_totp=AsyncMock(return_value=("secret", "otpauth://uri")),
            confirm_totp=AsyncMock(return_value=(True, ["code-1"])),
            disable_totp=AsyncMock(return_value=True),
            validate_totp_for_login=AsyncMock(return_value=(True, False)),
        )
        self.manager = MagicMock()
        self.manager.authenticate_password = AsyncMock(return_value=user)
        self.manager.password_helper.verify_and_update = MagicMock(
            side_effect=lambda password, _hash: (password == PASSWORD, None),
        )
        self.guard = MagicMock()
        self.guard.begin_attempt = AsyncMock(return_value=GuardOutcome.ALLOWED)
        self.guard.record_code_attempt = AsyncMock(return_value=GuardOutcome.ALLOWED)
        self.guard.record_password_attempt = AsyncMock(return_value=GuardOutcome.ALLOWED)
        self.guard.record_success = AsyncMock()
        self.guard.record_event = AsyncMock()
        self.manager.account_guard = self.guard
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


def _logged_types(harness: _Harness) -> list[AuthEventType]:
    return [call.args[0] for call in harness.guard.record_event.await_args_list]


def test_user_without_2fa_gets_a_token() -> None:
    harness = _Harness(_user())

    resp = harness.client.post("/auth/totp/login", json=LOGIN)

    assert resp.status_code == 200
    assert resp.json() == {"access_token": "a-token", "token_type": "bearer"}
    assert _logged_types(harness) == [AuthEventType.LOGIN_SUCCESS]


def test_credentials_reach_the_manager_as_username_and_password() -> None:
    harness = _Harness(_user())

    harness.client.post("/auth/totp/login", json=LOGIN)

    credentials = harness.manager.authenticate_password.await_args.args[0]
    assert (credentials.username, credentials.password) == (LOGIN["email"], LOGIN["password"])


def test_user_with_2fa_and_no_code_is_asked_for_one_and_gets_no_token() -> None:
    harness = _Harness(_user(totp_enabled=True))

    resp = harness.client.post("/auth/totp/login", json=LOGIN)

    assert resp.status_code == 200
    assert resp.json() == {"detail": "totp_required"}
    harness.strategy.write_token.assert_not_awaited()
    harness.guard.record_code_attempt.assert_not_awaited()


def test_correct_code_gets_a_token() -> None:
    harness = _Harness(_user(totp_enabled=True))

    resp = harness.client.post("/auth/totp/login", json=LOGIN | {"totp_code": "123456"})

    assert resp.json()["access_token"] == "a-token"
    harness.service.validate_totp_for_login.assert_awaited_once_with(LOGIN["email"], "123456")
    attempt = harness.guard.record_code_attempt.await_args
    assert attempt.kwargs["valid"] is True
    assert attempt.kwargs["success_events"] == (AuthEventType.TOTP_VERIFY_SUCCESS, AuthEventType.LOGIN_SUCCESS)


def test_recovery_code_is_logged_as_one() -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.service.validate_totp_for_login.return_value = (True, True)

    harness.client.post("/auth/totp/login", json=LOGIN | {"totp_code": "12345678"})

    assert harness.guard.record_code_attempt.await_args.kwargs["success_events"][0] == AuthEventType.TOTP_RECOVERY_USED


def test_wrong_code_gets_no_token() -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.service.validate_totp_for_login.return_value = (False, False)
    harness.guard.record_code_attempt.return_value = GuardOutcome.WRONG

    resp = harness.client.post("/auth/totp/login", json=LOGIN | {"totp_code": "000000"})

    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid_totp"
    assert harness.guard.record_code_attempt.await_args.kwargs["valid"] is False
    harness.strategy.write_token.assert_not_awaited()


@pytest.mark.parametrize(
    "user, detail, event, reason",
    [
        (_user(is_active=False), "LOGIN_BAD_CREDENTIALS", AuthEventType.LOGIN_FAILURE, "account_inactive"),
        (_user(is_verified=False), "LOGIN_USER_NOT_VERIFIED", AuthEventType.LOGIN_BLOCKED_UNVERIFIED, None),
    ],
    ids=["inactive", "unverified"],
)
def test_refused_logins_get_no_token_and_are_recorded(
    user: SimpleNamespace,
    detail: str,
    event: AuthEventType,
    reason: str | None,
) -> None:
    harness = _Harness(user)

    resp = harness.client.post("/auth/totp/login", json=LOGIN)

    assert resp.status_code == 400
    assert resp.json()["detail"] == detail
    assert _logged_types(harness) == [event]
    assert (harness.guard.record_event.await_args.kwargs.get("metadata") or {}).get("reason") == reason
    harness.strategy.write_token.assert_not_awaited()


def test_a_refused_password_gets_no_token_and_no_second_row() -> None:
    harness = _Harness(None)

    resp = harness.client.post("/auth/totp/login", json=LOGIN)

    assert resp.status_code == 400
    assert resp.json()["detail"] == "LOGIN_BAD_CREDENTIALS"
    assert _logged_types(harness) == []
    harness.strategy.write_token.assert_not_awaited()


def test_an_oversized_email_is_refused_before_anything_is_recorded() -> None:
    harness = _Harness(None)

    resp = harness.client.post("/auth/totp/login", json={**LOGIN, "email": "a@" + "b" * 320})

    assert resp.status_code == 422
    harness.manager.authenticate_password.assert_not_awaited()


def test_login_runs_the_checks_it_was_given() -> None:
    async def refuse() -> None:
        raise HTTPException(status_code=429, detail="too many")

    harness = _Harness(_user(), Depends(refuse))

    resp = harness.client.post("/auth/totp/login", json=LOGIN)

    assert resp.status_code == 429
    harness.manager.authenticate_password.assert_not_awaited()


def test_login_checks_dont_apply_to_other_routes() -> None:
    async def refuse() -> None:
        raise HTTPException(status_code=429, detail="too many")

    harness = _Harness(_user(), Depends(refuse))

    assert harness.client.get("/auth/totp/status").json() == {"enabled": False}


def test_setup_is_refused_when_already_enabled() -> None:
    harness = _Harness(_user(totp_enabled=True))

    assert harness.client.post("/auth/totp/setup", json={"password": PASSWORD}).status_code == 400
    harness.service.setup_totp.assert_not_awaited()


def test_setup_returns_the_secret() -> None:
    resp = _Harness(_user()).client.post("/auth/totp/setup", json={"password": PASSWORD})

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


def test_setup_with_the_wrong_password_starts_nothing_and_counts_the_guess() -> None:
    harness = _Harness(_user())
    harness.guard.record_password_attempt.return_value = GuardOutcome.WRONG

    resp = harness.client.post("/auth/totp/setup", json={"password": "wrong"})

    assert resp.status_code == 403
    harness.service.setup_totp.assert_not_awaited()
    assert harness.guard.record_password_attempt.await_args.kwargs["correct"] is False


def test_setup_needs_a_password() -> None:
    harness = _Harness(_user())

    assert harness.client.post("/auth/totp/setup").status_code == 422
    assert harness.client.post("/auth/totp/setup", json={"password": ""}).status_code == 422
    harness.service.setup_totp.assert_not_awaited()
    harness.guard.record_password_attempt.assert_not_awaited()


def test_setup_on_a_locked_account_checks_no_password() -> None:
    harness = _Harness(_user())
    harness.guard.begin_attempt.return_value = GuardOutcome.LOCKED

    resp = harness.client.post("/auth/totp/setup", json={"password": PASSWORD})

    assert resp.status_code == 429
    harness.service.setup_totp.assert_not_awaited()
    harness.manager.password_helper.verify_and_update.assert_not_called()


def test_verify_on_a_locked_account_checks_no_code() -> None:
    harness = _Harness(_user())
    harness.guard.begin_attempt.return_value = GuardOutcome.LOCKED

    assert harness.client.post("/auth/totp/verify", json={"code": "123456"}).status_code == 429
    harness.service.confirm_totp.assert_not_awaited()


def test_verify_guess_that_arrives_after_a_lock_gets_the_lock_answer() -> None:
    harness = _Harness(_user())
    harness.service.confirm_totp.return_value = (False, [])
    harness.guard.record_code_attempt.return_value = GuardOutcome.LOCKED

    assert harness.client.post("/auth/totp/verify", json={"code": "000000"}).status_code == 429


def test_double_press_on_verify_says_it_is_already_on() -> None:
    harness = _Harness(_user())
    harness.service.confirm_totp.return_value = (False, [])
    harness.guard.record_code_attempt.return_value = GuardOutcome.STATE_CHANGED

    resp = harness.client.post("/auth/totp/verify", json={"code": "123456"})

    assert (resp.status_code, resp.json()["detail"]) == (400, "2FA is already enabled")
    assert harness.guard.record_code_attempt.await_args.kwargs["expect_totp_enabled"] is False


def test_setup_racing_a_verify_is_refused() -> None:
    harness = _Harness(_user())
    harness.service.setup_totp.side_effect = TotpAlreadyEnabledError

    assert harness.client.post("/auth/totp/setup", json={"password": PASSWORD}).status_code == 400


def test_verify_returns_recovery_codes_and_logs_the_event() -> None:
    harness = _Harness(_user())

    resp = harness.client.post("/auth/totp/verify", json={"code": "123456"})

    assert resp.json() == {"verified": True, "recovery_codes": ["code-1"]}
    assert harness.guard.record_success.await_args.kwargs["events"] == (AuthEventType.TOTP_ENABLED,)


def test_wrong_verify_code_enables_nothing() -> None:
    harness = _Harness(_user())
    harness.service.confirm_totp.return_value = (False, [])

    assert harness.client.post("/auth/totp/verify", json={"code": "000000"}).status_code == 400
    assert _logged_types(harness) == []


def test_verify_is_refused_when_already_enabled_and_keeps_the_recovery_codes() -> None:
    harness = _Harness(_user(totp_enabled=True))

    assert harness.client.post("/auth/totp/verify", json={"code": "123456"}).status_code == 400
    harness.service.confirm_totp.assert_not_awaited()


def test_disable_logs_the_event() -> None:
    harness = _Harness(_user(totp_enabled=True))

    resp = harness.client.post("/auth/totp/disable", json={"code": "123456"})

    assert resp.json() == {"disabled": True}
    assert harness.guard.record_success.await_args.kwargs["events"] == (AuthEventType.TOTP_DISABLED,)


def test_double_press_on_disable_counts_nothing() -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.service.disable_totp.return_value = False
    harness.guard.record_code_attempt.return_value = GuardOutcome.STATE_CHANGED

    resp = harness.client.post("/auth/totp/disable", json={"code": "123456"})

    assert (resp.status_code, resp.json()["detail"]) == (400, "2FA is not enabled")
    assert harness.guard.record_code_attempt.await_args.kwargs["expect_totp_enabled"] is True


def test_wrong_disable_code_disables_nothing() -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.service.disable_totp.return_value = False
    harness.guard.record_code_attempt.return_value = GuardOutcome.WRONG

    resp = harness.client.post("/auth/totp/disable", json={"code": "000000"})

    assert (resp.status_code, resp.json()["detail"]) == (400, "Invalid code")
    harness.guard.record_success.assert_not_awaited()


def test_disable_when_off_is_told_so_and_counts_nothing() -> None:
    harness = _Harness(_user(totp_enabled=False))

    resp = harness.client.post("/auth/totp/disable", json={"code": "123456"})

    assert (resp.status_code, resp.json()["detail"]) == (400, "2FA is not enabled")
    harness.service.disable_totp.assert_not_awaited()
    harness.guard.record_code_attempt.assert_not_awaited()


def test_disable_on_a_locked_account_checks_no_code() -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.guard.begin_attempt.return_value = GuardOutcome.LOCKED

    assert harness.client.post("/auth/totp/disable", json={"code": "123456"}).status_code == 429
    harness.service.disable_totp.assert_not_awaited()


def test_disable_guess_that_arrives_after_a_lock_gets_the_lock_answer() -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.service.disable_totp.return_value = False
    harness.guard.record_code_attempt.return_value = GuardOutcome.LOCKED

    assert harness.client.post("/auth/totp/disable", json={"code": "000000"}).status_code == 429


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef"])
def test_verify_only_accepts_six_digits(code: str) -> None:
    harness = _Harness(_user())

    assert harness.client.post("/auth/totp/verify", json={"code": code}).status_code == 422
    harness.service.confirm_totp.assert_not_awaited()


@pytest.mark.parametrize("code_is_right", [True, False], ids=["right", "wrong"])
def test_a_lock_from_codes_sent_together_stops_this_one_too(code_is_right: bool) -> None:
    harness = _Harness(_user(totp_enabled=True))
    harness.guard.record_code_attempt.return_value = GuardOutcome.LOCKED
    harness.service.validate_totp_for_login.return_value = (code_is_right, False)

    resp = harness.client.post("/auth/totp/login", json=LOGIN | {"totp_code": "000000"})

    assert resp.status_code == 400
    assert resp.json()["detail"] == "LOGIN_BAD_CREDENTIALS"
    harness.strategy.write_token.assert_not_awaited()
