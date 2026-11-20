"""Wrong codes at the strict superuser gate count toward the account lockout.

Read back from a real database: the gate must save the count, refuse a locked account
even with the right code, and leave the user row free.
"""
import uuid
from collections.abc import AsyncIterator

import pytest_asyncio

from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.account_lockout import DEFAULT_LOCKOUT_THRESHOLD
from tests.real_auth_stack import (
    STRICT_SUPERUSER_PATH,
    RealAuthStack,
    StackUser,
    current_code,
    make_stack,
)


@pytest_asyncio.fixture
async def stack() -> AsyncIterator[RealAuthStack]:
    async with make_stack(pool_size=1) as made:
        yield made


async def _signed_in_superuser(stack: RealAuthStack) -> tuple[StackUser, str]:
    user, secret, _ = await stack.add_user_with_2fa()
    await stack.set_lockout(user.id, is_superuser=True)
    stack.signed_in = user.id
    return user, secret


async def _call_gate(stack: RealAuthStack, code: str) -> int:
    resp = await stack.client.post(STRICT_SUPERUSER_PATH, headers={"X-TOTP-Code": code})
    return resp.status_code


async def _failed_count(stack: RealAuthStack, user_id: uuid.UUID) -> int:
    return (await stack.stored_user(user_id)).failed_login_count


async def test_the_right_code_passes_and_the_row_is_free(stack: RealAuthStack) -> None:
    user, secret = await _signed_in_superuser(stack)

    assert await _call_gate(stack, current_code(secret)) == 204

    assert await _failed_count(stack, user.id) == 0
    assert AuthEventType.SUPERUSER_GATE_PASSED in await stack.stored_event_types(user.id)
    await stack.assert_row_is_free(user.id)


async def test_a_wrong_code_saves_the_count(stack: RealAuthStack) -> None:
    user, _ = await _signed_in_superuser(stack)

    resp = await stack.client.post(STRICT_SUPERUSER_PATH, headers={"X-TOTP-Code": "000000"})

    assert (resp.status_code, resp.json()["detail"]) == (401, "invalid_totp")
    assert resp.headers["X-Require-Step-Up"] == "totp"
    assert await _failed_count(stack, user.id) == 1
    assert AuthEventType.SUPERUSER_GATE_DENIED_BAD_TOTP in await stack.stored_event_types(user.id)
    await stack.assert_row_is_free(user.id)


async def test_wrong_codes_lock_and_then_the_right_one_is_refused(stack: RealAuthStack) -> None:
    user, secret = await _signed_in_superuser(stack)

    statuses = [await _call_gate(stack, "000000") for _ in range(DEFAULT_LOCKOUT_THRESHOLD)]

    assert statuses == [401] * DEFAULT_LOCKOUT_THRESHOLD
    assert (await stack.stored_user(user.id)).locked_until is not None

    assert await _call_gate(stack, current_code(secret)) == 429
    assert AuthEventType.SUPERUSER_GATE_PASSED not in await stack.stored_event_types(user.id)
    assert AuthEventType.LOGIN_BLOCKED_LOCKED in await stack.stored_event_types(user.id)
    await stack.assert_row_is_free(user.id)


async def test_the_gate_and_account_deletion_share_one_count(stack: RealAuthStack) -> None:
    user, secret = await _signed_in_superuser(stack)

    for _ in range(DEFAULT_LOCKOUT_THRESHOLD - 1):
        assert await _call_gate(stack, "000000") == 401
    resp = await stack.client.request(
        "DELETE",
        "/users/me",
        json={"password": "the-right-password", "confirm_email": user.email, "totp_code": "000000"},
    )
    assert resp.status_code == 403

    assert await _call_gate(stack, current_code(secret)) == 429
    assert await stack.stored_user(user.id) is not None
