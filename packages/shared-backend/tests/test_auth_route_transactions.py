"""What the shared auth routes actually save, read back from a real database.

Every request here runs on a one-connection pool unless the test says otherwise, so a
route that holds its connection while a service waits for another fails with a timeout.
"""
import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from platform_shared.core.auth_events import AuthEventType
from platform_shared.db.session import release_connection
from platform_shared.services.account_deletion import AccountDeletionBlockedError
from platform_shared.services.account_guard_service import AccountGuardService
from platform_shared.services.guard_outcome import GuardOutcome
from platform_shared.services.totp_already_enabled_error import TotpAlreadyEnabledError
from tests.real_auth_stack import (
    EMAIL_DOMAIN,
    PASSWORD,
    RealAuthStack,
    StackUser,
    current_code,
    make_stack,
)

THRESHOLD = 5


@pytest_asyncio.fixture
async def stack() -> AsyncIterator[RealAuthStack]:
    async with make_stack(pool_size=1) as made:
        yield made


@pytest_asyncio.fixture
async def wide_stack() -> AsyncIterator[RealAuthStack]:
    async with make_stack(pool_size=20) as made:
        yield made


def _login_body(user: StackUser, password: str = PASSWORD, **extra: Any) -> dict[str, Any]:
    return {"email": user.email, "password": password, **extra}


def _delete_body(user: StackUser, password: str = PASSWORD, **extra: Any) -> dict[str, Any]:
    return {"password": password, "confirm_email": user.email, **extra}


async def _delete(stack: RealAuthStack, body: dict[str, Any]) -> Any:
    return await stack.client.request("DELETE", "/users/me", json=body)


def _guard(stack: RealAuthStack) -> AccountGuardService:
    return AccountGuardService(user_model=StackUser, unit_of_work_factory=stack.unit_of_work)


def test_release_connection_refuses_a_session_with_unsaved_changes() -> None:
    session = SimpleNamespace(new=[object()], dirty=(), deleted=())

    with pytest.raises(RuntimeError):
        asyncio.run(release_connection(session))  # type: ignore[arg-type]


async def test_password_login_saves_its_audit_row(stack: RealAuthStack) -> None:
    user = await stack.add_user(failed_login_count=3)

    resp = await stack.client.post("/auth/totp/login", json=_login_body(user))

    assert resp.status_code == 200 and resp.json()["access_token"]
    assert await stack.stored_event_types(user.id) == [AuthEventType.LOGIN_SUCCESS]
    assert (await stack.stored_user(user.id)).failed_login_count == 0


async def test_wrong_password_saves_the_count_and_the_row(stack: RealAuthStack) -> None:
    user = await stack.add_user()

    resp = await stack.client.post("/auth/totp/login", json=_login_body(user, "wrong"))

    assert (resp.status_code, resp.json()["detail"]) == (400, "LOGIN_BAD_CREDENTIALS")
    assert (await stack.stored_user(user.id)).failed_login_count == 1
    events = await stack.stored_events(user.id)
    assert [(e.event_type, e.event_metadata.get("reason")) for e in events] == [
        (AuthEventType.LOGIN_FAILURE, "bad_password"),
    ]


async def test_unknown_email_saves_a_row_without_the_address(stack: RealAuthStack) -> None:
    resp = await stack.client.post(
        "/auth/totp/login", json={"email": f"nobody@{EMAIL_DOMAIN}", "password": "x"},
    )

    assert resp.status_code == 400
    assert await stack.stored_event_types(None) == [AuthEventType.LOGIN_FAILURE]


async def test_unverified_login_saves_its_row(stack: RealAuthStack) -> None:
    user = await stack.add_user(is_verified=False)

    resp = await stack.client.post("/auth/totp/login", json=_login_body(user))

    assert (resp.status_code, resp.json()["detail"]) == (400, "LOGIN_USER_NOT_VERIFIED")
    assert await stack.stored_event_types(user.id) == [AuthEventType.LOGIN_BLOCKED_UNVERIFIED]


async def test_wrong_passwords_lock_and_then_the_right_one_is_refused(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    for _ in range(THRESHOLD):
        await stack.client.post("/auth/totp/login", json=_login_body(user, "wrong"))

    resp = await stack.client.post("/auth/totp/login", json=_login_body(user))

    assert (resp.status_code, resp.json()["detail"]) == (400, "LOGIN_BAD_CREDENTIALS")
    stored = await stack.stored_user(user.id)
    assert stored.failed_login_count == THRESHOLD and stored.locked_until is not None
    assert (await stack.stored_event_types(user.id))[-1] == AuthEventType.LOGIN_BLOCKED_LOCKED


async def test_a_refused_locked_login_records_where_it_came_from(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    for _ in range(THRESHOLD):
        await stack.client.post("/auth/totp/login", json=_login_body(user, "wrong"))

    await stack.client.post(
        "/auth/totp/login", json=_login_body(user), headers={"User-Agent": "LockedClient/1.0"},
    )

    blocked = (await stack.stored_events(user.id))[-1]
    assert blocked.event_type == AuthEventType.LOGIN_BLOCKED_LOCKED
    assert blocked.ip_address is not None
    assert blocked.user_agent == "LockedClient/1.0"


async def test_old_failures_stop_counting(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    await stack.set_lockout(
        user.id,
        failed_login_count=4,
        last_failed_login_at=datetime.now(timezone.utc) - timedelta(hours=25),
    )

    await stack.client.post("/auth/totp/login", json=_login_body(user, "wrong"))

    assert (await stack.stored_user(user.id)).failed_login_count == 1


async def test_recent_failures_keep_counting(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    await stack.set_lockout(
        user.id,
        failed_login_count=3,
        last_failed_login_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )

    await stack.client.post("/auth/totp/login", json=_login_body(user, "wrong"))

    assert (await stack.stored_user(user.id)).failed_login_count == 4


async def test_an_expired_lock_lets_the_right_password_in(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    await stack.set_lockout(
        user.id,
        failed_login_count=THRESHOLD,
        locked_until=datetime.now(timezone.utc) - timedelta(seconds=1),
        last_failed_login_at=datetime.now(timezone.utc) - timedelta(minutes=2),
    )

    resp = await stack.client.post("/auth/totp/login", json=_login_body(user))

    assert resp.json()["access_token"]
    stored = await stack.stored_user(user.id)
    assert stored.failed_login_count == 0 and stored.locked_until is None


async def test_a_failure_after_a_lock_expires_locks_for_longer(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    await stack.set_lockout(
        user.id,
        failed_login_count=THRESHOLD,
        locked_until=datetime.now(timezone.utc) - timedelta(seconds=1),
        last_failed_login_at=datetime.now(timezone.utc) - timedelta(minutes=2),
    )

    await stack.client.post("/auth/totp/login", json=_login_body(user, "wrong"))

    stored = await stack.stored_user(user.id)
    remaining = stored.locked_until - datetime.now(timezone.utc)
    assert stored.failed_login_count == THRESHOLD + 1
    assert timedelta(minutes=4) < remaining <= timedelta(minutes=5)


@pytest.mark.parametrize("has_2fa", [False, True], ids=["no 2fa", "2fa"])
async def test_jwt_login_saves_a_wrong_password(stack: RealAuthStack, has_2fa: bool) -> None:
    user = (await stack.add_user_with_2fa())[0] if has_2fa else await stack.add_user()

    assert await stack.jwt_login(user.email, "wrong") is None

    assert (await stack.stored_user(user.id)).failed_login_count == 1
    assert AuthEventType.LOGIN_FAILURE in await stack.stored_event_types(user.id)


async def test_jwt_login_saves_success_and_clears_the_count(stack: RealAuthStack) -> None:
    user = await stack.add_user(failed_login_count=3)

    assert (await stack.jwt_login(user.email)).id == user.id

    assert (await stack.stored_user(user.id)).failed_login_count == 0
    assert await stack.stored_event_types(user.id) == [AuthEventType.LOGIN_SUCCESS]


async def test_jwt_login_saves_the_row_for_a_locked_account(stack: RealAuthStack) -> None:
    """This row used to be added to the session and never saved."""
    user = await stack.add_user()
    await stack.set_lockout(user.id, locked_until=datetime.now(timezone.utc) + timedelta(minutes=5))

    assert await stack.jwt_login(user.email) is None

    assert await stack.stored_event_types(user.id) == [AuthEventType.LOGIN_BLOCKED_LOCKED]


async def test_jwt_login_saves_an_unknown_email_by_domain_only(stack: RealAuthStack) -> None:
    assert await stack.jwt_login(f"nobody@{EMAIL_DOMAIN}") is None

    events = await stack.stored_events(None)
    assert [e.event_metadata for e in events] == [{"email_domain": EMAIL_DOMAIN, "reason": "unknown_email"}]


async def test_jwt_login_turns_away_unverified_and_2fa_users(stack: RealAuthStack) -> None:
    unverified = await stack.add_user(is_verified=False)
    with_2fa, _, _ = await stack.add_user_with_2fa(failed_login_count=3)

    assert await stack.jwt_login(unverified.email) is None
    assert await stack.jwt_login(with_2fa.email) is None

    assert await stack.stored_event_types(unverified.id) == [AuthEventType.LOGIN_BLOCKED_UNVERIFIED]
    assert (await stack.stored_user(with_2fa.id)).failed_login_count == 3


async def test_right_password_alone_keeps_the_count_of_a_2fa_user(stack: RealAuthStack) -> None:
    user, _, _ = await stack.add_user_with_2fa(failed_login_count=3)

    resp = await stack.client.post("/auth/totp/login", json=_login_body(user))

    assert resp.json() == {"detail": "totp_required"}
    assert (await stack.stored_user(user.id)).failed_login_count == 3


async def test_right_code_finishes_the_login_and_clears_the_count(stack: RealAuthStack) -> None:
    user, secret, _ = await stack.add_user_with_2fa(failed_login_count=3)

    resp = await stack.client.post(
        "/auth/totp/login", json=_login_body(user, totp_code=current_code(secret)),
    )

    assert resp.json()["access_token"]
    assert (await stack.stored_user(user.id)).failed_login_count == 0
    assert await stack.stored_event_types(user.id) == [
        AuthEventType.TOTP_VERIFY_SUCCESS, AuthEventType.LOGIN_SUCCESS,
    ]


async def test_recovery_code_is_saved_as_one(stack: RealAuthStack) -> None:
    user, _, recovery_codes = await stack.add_user_with_2fa()

    resp = await stack.client.post(
        "/auth/totp/login", json=_login_body(user, totp_code=recovery_codes[0]),
    )

    assert resp.json()["access_token"]
    assert (await stack.stored_event_types(user.id))[0] == AuthEventType.TOTP_RECOVERY_USED


async def test_wrong_codes_lock_even_with_the_right_password(stack: RealAuthStack) -> None:
    user, secret, _ = await stack.add_user_with_2fa()
    for _ in range(THRESHOLD):
        resp = await stack.client.post(
            "/auth/totp/login", json=_login_body(user, totp_code="000000"),
        )
        assert (resp.status_code, resp.json()["detail"]) == (401, "invalid_totp")

    resp = await stack.client.post(
        "/auth/totp/login", json=_login_body(user, totp_code=current_code(secret)),
    )

    assert (resp.status_code, resp.json()["detail"]) == (400, "LOGIN_BAD_CREDENTIALS")
    stored = await stack.stored_user(user.id)
    assert stored.failed_login_count == THRESHOLD and stored.locked_until is not None
    assert AuthEventType.TOTP_VERIFY_FAILURE in await stack.stored_event_types(user.id)


async def test_setup_then_verify_turns_2fa_on_and_saves_the_event(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    stack.signed_in = user.id

    setup = await stack.client.post("/auth/totp/setup", json={"password": PASSWORD})
    assert setup.status_code == 200

    wrong = await stack.client.post("/auth/totp/verify", json={"code": "000000"})
    assert wrong.status_code == 400
    assert not (await stack.stored_user(user.id)).totp_enabled

    right = await stack.client.post("/auth/totp/verify", json={"code": current_code(setup.json()["secret"])})
    assert right.status_code == 200 and right.json()["recovery_codes"]
    assert (await stack.stored_user(user.id)).totp_enabled
    assert await stack.stored_event_types(user.id) == [
        AuthEventType.LOGIN_FAILURE,
        AuthEventType.TOTP_VERIFY_FAILURE,
        AuthEventType.TOTP_ENABLED,
    ]
    stored = await stack.stored_user(user.id)
    assert stored.failed_login_count == 0


async def test_setup_with_the_wrong_password_counts_and_starts_nothing(stack: RealAuthStack) -> None:
    user = await stack.add_user(failed_login_count=3)
    stack.signed_in = user.id

    resp = await stack.client.post("/auth/totp/setup", json={"password": "wrong"})

    assert resp.status_code == 403
    stored = await stack.stored_user(user.id)
    assert stored.failed_login_count == 4
    assert stored.totp_secret is None


async def test_setup_with_the_right_password_clears_the_count(stack: RealAuthStack) -> None:
    user = await stack.add_user(failed_login_count=3)
    stack.signed_in = user.id

    resp = await stack.client.post("/auth/totp/setup", json={"password": PASSWORD})

    assert resp.status_code == 200
    assert (await stack.stored_user(user.id)).failed_login_count == 0


async def test_a_refused_setup_with_the_right_password_keeps_the_count(stack: RealAuthStack) -> None:
    user = await stack.add_user(failed_login_count=3)
    stack.signed_in = user.id

    with patch.object(type(stack.totp), "setup_totp", AsyncMock(side_effect=TotpAlreadyEnabledError)):
        resp = await stack.client.post("/auth/totp/setup", json={"password": PASSWORD})

    assert resp.status_code == 400
    assert (await stack.stored_user(user.id)).failed_login_count == 3


async def test_setup_on_a_locked_account_is_refused_and_saves_the_row(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    stack.signed_in = user.id
    await stack.set_lockout(
        user.id, failed_login_count=THRESHOLD, locked_until=datetime.now(timezone.utc) + timedelta(minutes=1),
    )

    resp = await stack.client.post("/auth/totp/setup", json={"password": PASSWORD})

    assert resp.status_code == 429
    assert (await stack.stored_user(user.id)).totp_secret is None
    assert await stack.stored_event_types(user.id) == [AuthEventType.LOGIN_BLOCKED_LOCKED]


async def test_wrong_setup_codes_lock_the_account_and_then_the_right_one_is_refused(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    stack.signed_in = user.id
    setup = await stack.client.post("/auth/totp/setup", json={"password": PASSWORD})

    for _ in range(THRESHOLD):
        assert (await stack.client.post("/auth/totp/verify", json={"code": "000000"})).status_code == 400

    right = await stack.client.post("/auth/totp/verify", json={"code": current_code(setup.json()["secret"])})

    assert right.status_code == 429
    stored = await stack.stored_user(user.id)
    assert not stored.totp_enabled
    assert stored.failed_login_count == THRESHOLD and stored.locked_until is not None


async def test_a_second_press_of_a_used_setup_code_is_not_a_guess(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    stack.signed_in = user.id
    setup = await stack.client.post("/auth/totp/setup", json={"password": PASSWORD})
    code = current_code(setup.json()["secret"])

    first, second = await asyncio.gather(
        stack.client.post("/auth/totp/verify", json={"code": code}),
        stack.client.post("/auth/totp/verify", json={"code": code}),
    )

    assert sorted((first.status_code, second.status_code)) == [200, 400]
    stored = await stack.stored_user(user.id)
    assert stored.totp_enabled and stored.failed_login_count == 0


async def test_a_setup_code_with_no_setup_in_progress_is_not_a_guess(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    stack.signed_in = user.id

    resp = await stack.client.post("/auth/totp/verify", json={"code": "000000"})

    assert resp.status_code == 400
    assert resp.json()["detail"] == "No 2FA setup in progress. Cancel and start again."
    stored = await stack.stored_user(user.id)
    assert stored.failed_login_count == 0 and stored.locked_until is None
    assert await stack.stored_event_types(user.id) == []


async def test_a_lock_landing_during_setup_stops_it_and_stays_on(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    stack.signed_in = user.id
    locked_until = datetime.now(timezone.utc) + timedelta(minutes=1)
    await stack.set_lockout(user.id, failed_login_count=THRESHOLD, locked_until=locked_until)
    guard = type(_guard(stack))

    with (
        patch.object(guard, "begin_attempt", AsyncMock(return_value=GuardOutcome.ALLOWED)),
        patch.object(guard, "record_password_attempt", AsyncMock(return_value=GuardOutcome.ALLOWED)),
    ):
        resp = await stack.client.post("/auth/totp/setup", json={"password": PASSWORD})

    assert resp.status_code == 429
    stored = await stack.stored_user(user.id)
    assert stored.totp_secret is None
    assert stored.failed_login_count == THRESHOLD and stored.locked_until == locked_until
    assert await stack.stored_event_types(user.id) == [AuthEventType.LOGIN_BLOCKED_LOCKED]


async def test_a_lock_landing_just_after_setup_saved_stays_on(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    stack.signed_in = user.id
    real_setup = stack.totp.setup_totp
    locked_until: list[datetime] = []

    async def setup_then_lock(user_id: uuid.UUID) -> tuple[str, str]:
        result = await real_setup(user_id)
        locked_until.append(await _lock_landing_mid_request(stack, user_id))
        return result

    with patch.object(type(stack.totp), "setup_totp", side_effect=setup_then_lock):
        resp = await stack.client.post("/auth/totp/setup", json={"password": PASSWORD})

    assert resp.status_code == 200
    stored = await stack.stored_user(user.id)
    assert stored.failed_login_count == THRESHOLD and stored.locked_until == locked_until[0]


async def test_wrong_disable_code_saves_the_count_and_the_row(stack: RealAuthStack) -> None:
    user, _, _ = await stack.add_user_with_2fa()
    stack.signed_in = user.id

    resp = await stack.client.post("/auth/totp/disable", json={"code": "000000"})

    assert (resp.status_code, resp.json()["detail"]) == (400, "Invalid code")
    stored = await stack.stored_user(user.id)
    assert stored.failed_login_count == 1 and stored.totp_enabled
    assert AuthEventType.TOTP_VERIFY_FAILURE in await stack.stored_event_types(user.id)


async def test_locked_disable_checks_no_code_and_saves_the_row(stack: RealAuthStack) -> None:
    user, secret, _ = await stack.add_user_with_2fa()
    await stack.set_lockout(user.id, locked_until=datetime.now(timezone.utc) + timedelta(minutes=5))
    stack.signed_in = user.id

    resp = await stack.client.post("/auth/totp/disable", json={"code": current_code(secret)})

    assert resp.status_code == 429
    assert (await stack.stored_user(user.id)).totp_enabled
    assert await stack.stored_event_types(user.id) == [AuthEventType.LOGIN_BLOCKED_LOCKED]


async def test_right_disable_code_turns_it_off_and_clears_the_count(stack: RealAuthStack) -> None:
    user, secret, _ = await stack.add_user_with_2fa(failed_login_count=3)
    stack.signed_in = user.id

    resp = await stack.client.post("/auth/totp/disable", json={"code": current_code(secret)})

    assert resp.json() == {"disabled": True}
    stored = await stack.stored_user(user.id)
    assert not stored.totp_enabled and stored.failed_login_count == 0
    assert await stack.stored_event_types(user.id) == [AuthEventType.TOTP_DISABLED]


async def test_a_code_rejected_because_the_state_changed_counts_nothing(stack: RealAuthStack) -> None:
    user = await stack.add_user()

    outcome = await _guard(stack).record_code_attempt(user.id, valid=False, expect_totp_enabled=True)

    assert outcome is GuardOutcome.STATE_CHANGED
    assert (await stack.stored_user(user.id)).failed_login_count == 0


async def test_deleting_with_the_wrong_password_saves_the_count(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    stack.signed_in = user.id

    resp = await _delete(stack, _delete_body(user, "wrong"))

    assert (resp.status_code, resp.json()["detail"]) == (403, "Incorrect password")
    assert (await stack.stored_user(user.id)).failed_login_count == 1


async def test_deleting_while_locked_is_refused_and_saves_the_row(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    await stack.set_lockout(user.id, locked_until=datetime.now(timezone.utc) + timedelta(minutes=5))
    stack.signed_in = user.id

    resp = await _delete(stack, _delete_body(user))

    assert resp.status_code == 429
    assert await stack.stored_user(user.id) is not None
    assert await stack.stored_event_types(user.id) == [AuthEventType.LOGIN_BLOCKED_LOCKED]


async def test_deleting_with_the_wrong_code_saves_the_count(stack: RealAuthStack) -> None:
    user, _, _ = await stack.add_user_with_2fa()
    stack.signed_in = user.id

    resp = await _delete(stack, _delete_body(user, totp_code="000000"))

    assert (resp.status_code, resp.json()["detail"]) == (403, "Invalid TOTP code")
    assert (await stack.stored_user(user.id)).failed_login_count == 1


async def test_a_right_password_doesnt_clear_the_count_before_deleting(stack: RealAuthStack) -> None:
    user = await stack.add_user(failed_login_count=3)
    stack.signed_in = user.id

    resp = await _delete(stack, _delete_body(user) | {"confirm_email": "not-it@example.com"})

    assert resp.status_code == 400
    assert (await stack.stored_user(user.id)).failed_login_count == 3


async def test_deleting_removes_the_user_and_keeps_the_audit_row(stack: RealAuthStack) -> None:
    user, secret, _ = await stack.add_user_with_2fa()
    stack.signed_in = user.id

    resp = await _delete(stack, _delete_body(user, totp_code=current_code(secret)))

    assert resp.status_code == 204
    assert await stack.stored_user(user.id) is None
    assert await stack.stored_event_types(user.id) == [AuthEventType.ACCOUNT_DELETED]


async def test_a_spent_code_stays_spent_if_the_deletion_is_then_refused(stack: RealAuthStack) -> None:
    user, secret, _ = await stack.add_user_with_2fa()
    stack.signed_in = user.id
    code = current_code(secret)

    async def refuse(*_: Any) -> None:
        raise AccountDeletionBlockedError("someone else depends on this")

    stack.prepare_deletion = refuse
    assert (await _delete(stack, _delete_body(user, totp_code=code))).status_code == 409

    stack.prepare_deletion = None
    resp = await _delete(stack, _delete_body(user, totp_code=code))

    assert (resp.status_code, resp.json()["detail"]) == (403, "Invalid TOTP code")
    assert await stack.stored_user(user.id) is not None


async def _phone_login(stack: RealAuthStack, user: StackUser) -> dict[str, Any]:
    resp = await stack.client.post("/auth/mobile/login", json=_login_body(user, device_name="Phone"))
    assert resp.status_code == 200
    return resp.json()


async def test_phone_login_saves_the_session_and_the_audit_row(stack: RealAuthStack) -> None:
    user = await stack.add_user()

    tokens = await _phone_login(stack, user)

    assert tokens["refresh_token"]
    assert [row.device_name for row in await stack.stored_refresh_sessions(user.id)] == ["Phone"]
    assert await stack.stored_event_types(user.id) == [AuthEventType.LOGIN_SUCCESS]


async def test_refresh_saves_the_new_token(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    first = (await _phone_login(stack, user))["refresh_token"]

    second = await stack.client.post("/auth/mobile/refresh", json={"refresh_token": first})
    assert second.status_code == 200

    third = await stack.client.post(
        "/auth/mobile/refresh", json={"refresh_token": second.json()["refresh_token"]},
    )
    assert third.status_code == 200


async def test_a_refused_refresh_that_ends_the_session_stays_ended(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    stolen = (await _phone_login(stack, user))["refresh_token"]
    owners = (await stack.client.post("/auth/mobile/refresh", json={"refresh_token": stolen})).json()["refresh_token"]
    await stack.client.post("/auth/mobile/refresh", json={"refresh_token": stolen})

    resp = await stack.client.post("/auth/mobile/refresh", json={"refresh_token": owners})

    assert (resp.status_code, resp.json()["detail"]) == (401, "refresh_invalid")
    assert await stack.stored_refresh_sessions(user.id) == []


async def test_logout_removes_the_session(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    tokens = await _phone_login(stack, user)

    resp = await stack.client.post("/auth/mobile/logout", json={"refresh_token": tokens["refresh_token"]})

    assert resp.status_code == 204
    assert await stack.stored_refresh_sessions(user.id) == []


async def test_signing_out_a_device_saves_the_row(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    tokens = await _phone_login(stack, user)
    stack.signed_in = user.id

    listed = await stack.client.get("/auth/mobile/sessions")
    assert [row["id"] for row in listed.json()] == [tokens["session_id"]]

    resp = await stack.client.delete(f"/auth/mobile/sessions/{tokens['session_id']}")

    assert resp.status_code == 204
    assert await stack.stored_refresh_sessions(user.id) == []
    events = await stack.stored_events(user.id)
    assert events[-1].event_type == AuthEventType.DEVICE_SIGNED_OUT
    assert events[-1].event_metadata == {"session_id": tokens["session_id"]}


async def test_signing_out_someone_elses_device_changes_nothing(stack: RealAuthStack) -> None:
    owner = await stack.add_user()
    tokens = await _phone_login(stack, owner)
    other = await stack.add_user()
    stack.signed_in = other.id

    resp = await stack.client.delete(f"/auth/mobile/sessions/{tokens['session_id']}")

    assert resp.status_code == 404
    assert len(await stack.stored_refresh_sessions(owner.id)) == 1
    assert await stack.stored_event_types(other.id) == []


async def test_no_route_leaves_the_user_row_locked(stack: RealAuthStack) -> None:
    user, secret, _ = await stack.add_user_with_2fa()
    stack.signed_in = user.id
    client = stack.client

    requests = [
        lambda: client.post("/auth/totp/login", json=_login_body(user, "wrong")),
        lambda: client.post("/auth/totp/login", json=_login_body(user)),
        lambda: client.post("/auth/totp/login", json=_login_body(user, totp_code="000000")),
        lambda: client.post("/auth/totp/login", json=_login_body(user, totp_code=current_code(secret))),
        lambda: client.post("/auth/mobile/login", json=_login_body(user, totp_code="000000", device_name="P")),
        lambda: client.post("/auth/totp/disable", json={"code": "000000"}),
        lambda: _delete(stack, _delete_body(user, "wrong")),
        lambda: _delete(stack, _delete_body(user, totp_code="000000")),
        lambda: client.post("/auth/totp/setup", json={"password": PASSWORD}),
        lambda: client.post("/auth/totp/verify", json={"code": "000000"}),
    ]
    for send in requests:
        await stack.set_lockout(user.id, failed_login_count=0, locked_until=None)
        await send()
        await stack.assert_row_is_free(user.id)

    assert await stack.jwt_login(user.email, "wrong") is None
    await stack.assert_row_is_free(user.id)


async def test_lockout_logs_never_contain_the_address(stack: RealAuthStack, caplog: pytest.LogCaptureFixture) -> None:
    user = await stack.add_user()

    with caplog.at_level(logging.DEBUG, logger="platform_shared"):
        for _ in range(THRESHOLD + 1):
            await stack.client.post("/auth/totp/login", json=_login_body(user, "wrong"))
        assert await stack.jwt_login(user.email) is None

    messages = [record.getMessage() for record in caplog.records if record.name.startswith("platform_shared")]
    assert any("Account locked" in message for message in messages)
    assert any("locked account" in message for message in messages)
    assert not any(user.email in message for message in messages)


async def _lock_landing_mid_request(stack: RealAuthStack, user_id: uuid.UUID) -> datetime:
    """A lock from guesses sent together lands after this request's first lock check."""
    locked_until = datetime.now(timezone.utc) + timedelta(minutes=1)
    await stack.set_lockout(user_id, failed_login_count=THRESHOLD, locked_until=locked_until)
    return locked_until


async def _assert_lock_untouched(stack: RealAuthStack, user_id: uuid.UUID, locked_until: datetime) -> None:
    stored = await stack.stored_user(user_id)
    assert stored.failed_login_count == THRESHOLD
    assert stored.locked_until == locked_until
    assert (await stack.stored_event_types(user_id)) == [AuthEventType.LOGIN_BLOCKED_LOCKED]


@pytest.mark.parametrize("correct", [True, False], ids=["right", "wrong"])
async def test_a_lock_landing_mid_request_stops_a_password_either_way(stack: RealAuthStack, correct: bool) -> None:
    user = await stack.add_user()
    locked_until = await _lock_landing_mid_request(stack, user.id)

    outcome = await _guard(stack).record_password_attempt(user.id, correct=correct, finishes_login=True)

    assert outcome is GuardOutcome.LOCKED
    await _assert_lock_untouched(stack, user.id, locked_until)


@pytest.mark.parametrize("valid", [True, False], ids=["right", "wrong"])
async def test_a_lock_landing_mid_request_stops_a_code_either_way(stack: RealAuthStack, valid: bool) -> None:
    user, _, _ = await stack.add_user_with_2fa()
    locked_until = await _lock_landing_mid_request(stack, user.id)

    outcome = await _guard(stack).record_code_attempt(
        user.id, valid=valid, success_events=(AuthEventType.LOGIN_SUCCESS,),
    )

    assert outcome is GuardOutcome.LOCKED
    await _assert_lock_untouched(stack, user.id, locked_until)


@pytest.mark.parametrize("valid", [True, False], ids=["right", "wrong"])
async def test_a_lock_landing_mid_request_stops_a_step_up_code_either_way(stack: RealAuthStack, valid: bool) -> None:
    user, _, _ = await stack.add_user_with_2fa()
    locked_until = await _lock_landing_mid_request(stack, user.id)

    outcome = await _guard(stack).spend_step_up_code(user.id, "123456", AsyncMock(return_value=valid))

    assert outcome is GuardOutcome.LOCKED
    await _assert_lock_untouched(stack, user.id, locked_until)


async def test_a_lock_landing_during_a_delete_records_where_it_came_from(stack: RealAuthStack) -> None:
    user, secret, _ = await stack.add_user_with_2fa()
    stack.signed_in = user.id
    await _lock_landing_mid_request(stack, user.id)

    with (
        patch.object(AccountGuardService, "begin_attempt", AsyncMock(return_value=GuardOutcome.ALLOWED)),
        patch.object(AccountGuardService, "record_password_attempt", AsyncMock(return_value=GuardOutcome.ALLOWED)),
    ):
        resp = await stack.client.request(
            "DELETE",
            "/users/me",
            json=_delete_body(user, totp_code=current_code(secret)),
            headers={"User-Agent": "LockedClient/1.0"},
        )

    assert resp.status_code == 429
    blocked = (await stack.stored_events(user.id))[-1]
    assert blocked.event_type == AuthEventType.LOGIN_BLOCKED_LOCKED
    assert blocked.ip_address is not None
    assert blocked.user_agent == "LockedClient/1.0"


@pytest.mark.parametrize(
    "fields", [{"is_verified": False}, {"is_active": False}], ids=["unverified", "inactive"],
)
async def test_a_refused_login_with_the_right_password_keeps_the_count(
    stack: RealAuthStack, fields: dict[str, bool],
) -> None:
    user = await stack.add_user(failed_login_count=3, **fields)

    resp = await stack.client.post("/auth/totp/login", json=_login_body(user))

    assert resp.status_code == 400
    assert (await stack.stored_user(user.id)).failed_login_count == 3


@pytest.mark.parametrize(
    "fields", [{"is_verified": False}, {"is_active": False}], ids=["unverified", "inactive"],
)
async def test_a_refused_jwt_login_with_the_right_password_keeps_the_count(
    stack: RealAuthStack, fields: dict[str, bool],
) -> None:
    user = await stack.add_user(failed_login_count=3, **fields)

    await stack.jwt_login(user.email)

    assert (await stack.stored_user(user.id)).failed_login_count == 3


async def test_two_step_turned_on_during_the_password_check_keeps_the_count(stack: RealAuthStack) -> None:
    user, _, _ = await stack.add_user_with_2fa(failed_login_count=3)

    outcome = await _guard(stack).record_password_attempt(user.id, correct=True, finishes_login=True)

    assert outcome is GuardOutcome.ALLOWED
    assert (await stack.stored_user(user.id)).failed_login_count == 3


async def _assert_counted_exactly_to_the_threshold(stack: RealAuthStack, user_id: uuid.UUID) -> None:
    stored = await stack.stored_user(user_id)
    assert stored.failed_login_count == THRESHOLD
    assert stored.locked_until is not None


async def test_wrong_passwords_sent_together_count_exactly_to_the_limit(wide_stack: RealAuthStack) -> None:
    user = await wide_stack.add_user()

    responses = await asyncio.gather(*(
        wide_stack.client.post("/auth/totp/login", json=_login_body(user, "wrong"))
        for _ in range(THRESHOLD + 5)
    ))

    assert {resp.status_code for resp in responses} == {400}
    await _assert_counted_exactly_to_the_threshold(wide_stack, user.id)


async def test_wrong_login_codes_sent_together_count_exactly_to_the_limit(wide_stack: RealAuthStack) -> None:
    user, _, _ = await wide_stack.add_user_with_2fa()

    responses = await asyncio.gather(*(
        wide_stack.client.post("/auth/totp/login", json=_login_body(user, totp_code="000000"))
        for _ in range(THRESHOLD + 5)
    ))

    assert {resp.status_code for resp in responses} <= {400, 401}
    await _assert_counted_exactly_to_the_threshold(wide_stack, user.id)


async def test_wrong_disable_codes_sent_together_count_exactly_to_the_limit(wide_stack: RealAuthStack) -> None:
    user, _, _ = await wide_stack.add_user_with_2fa()
    wide_stack.signed_in = user.id

    responses = await asyncio.gather(*(
        wide_stack.client.post("/auth/totp/disable", json={"code": "000000"})
        for _ in range(THRESHOLD + 5)
    ))

    assert {resp.status_code for resp in responses} <= {400, 429}
    await _assert_counted_exactly_to_the_threshold(wide_stack, user.id)


async def test_wrong_setup_passwords_sent_together_count_exactly_to_the_limit(wide_stack: RealAuthStack) -> None:
    user = await wide_stack.add_user()
    wide_stack.signed_in = user.id

    responses = await asyncio.gather(*(
        wide_stack.client.post("/auth/totp/setup", json={"password": "wrong"})
        for _ in range(THRESHOLD + 5)
    ))

    assert {resp.status_code for resp in responses} <= {403, 429}
    await _assert_counted_exactly_to_the_threshold(wide_stack, user.id)


async def test_wrong_setup_codes_sent_together_count_exactly_to_the_limit(wide_stack: RealAuthStack) -> None:
    user = await wide_stack.add_user()
    wide_stack.signed_in = user.id
    await wide_stack.client.post("/auth/totp/setup", json={"password": PASSWORD})

    responses = await asyncio.gather(*(
        wide_stack.client.post("/auth/totp/verify", json={"code": "000000"})
        for _ in range(THRESHOLD + 5)
    ))

    assert {resp.status_code for resp in responses} <= {400, 429}
    await _assert_counted_exactly_to_the_threshold(wide_stack, user.id)


async def test_wrong_delete_codes_sent_together_count_exactly_to_the_limit(wide_stack: RealAuthStack) -> None:
    user, _, _ = await wide_stack.add_user_with_2fa()
    wide_stack.signed_in = user.id

    responses = await asyncio.gather(*(
        _delete(wide_stack, _delete_body(user, totp_code="000000"))
        for _ in range(THRESHOLD + 5)
    ))

    assert {resp.status_code for resp in responses} <= {403, 429}
    await _assert_counted_exactly_to_the_threshold(wide_stack, user.id)
