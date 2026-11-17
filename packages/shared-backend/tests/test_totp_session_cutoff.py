"""Turning 2FA on or off signs out every other browser and phone, and not the caller.

Requests here are authenticated by their tokens, as in an app. Tokens issued in the same
whole second as a cutoff survive it, so the tokens that must stop working are issued
a few seconds earlier.
"""
import uuid
from collections.abc import AsyncIterator
from typing import Any

import jwt
import pytest_asyncio

from tests.real_auth_stack import (
    PASSWORD,
    SECRET,
    RealAuthStack,
    StackUser,
    current_code,
    make_stack,
    token_for,
)

_STATUS = "/auth/totp/status"
_EARLIER = 10
_PHONE_TOKEN_SECONDS = 1800


@pytest_asyncio.fixture
async def stack() -> AsyncIterator[RealAuthStack]:
    async with make_stack(pool_size=20, check_tokens=True) as made:
        yield made


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _works(stack: RealAuthStack, token: str) -> bool:
    status = (await stack.client.get(_STATUS, headers=_bearer(token))).status_code
    assert status in (200, 401)
    return status == 200


async def _phone_login(stack: RealAuthStack, user: StackUser, **extra: Any) -> dict[str, Any]:
    response = await stack.client.post(
        "/auth/mobile/login",
        json={"email": user.email, "password": PASSWORD, "device_name": "Phone", **extra},
    )
    assert response.status_code == 200
    return response.json()


async def _refreshes(stack: RealAuthStack, refresh_token: str) -> bool:
    status = (await stack.client.post("/auth/mobile/refresh", json={"refresh_token": refresh_token})).status_code
    assert status in (200, 401)
    return status == 200


async def _user_with_2fa(stack: RealAuthStack) -> tuple[StackUser, str]:
    """Turning it on set a cutoff. Cleared, the tokens a test issues next start out working."""
    user, secret, _ = await stack.add_user_with_2fa()
    await stack.set_lockout(user.id, auth_valid_after=None)
    return user, secret


async def _turn_on(stack: RealAuthStack, user: StackUser, caller_token: str) -> dict[str, Any]:
    setup = await stack.client.post("/auth/totp/setup", json={"password": PASSWORD}, headers=_bearer(caller_token))
    assert setup.status_code == 200
    verify = await stack.client.post(
        "/auth/totp/verify", json={"code": current_code(setup.json()["secret"])}, headers=_bearer(caller_token),
    )
    assert verify.status_code == 200
    return verify.json()


async def test_turning_2fa_on_in_a_browser_signs_out_everything_else(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    caller = token_for(user.id, issued_seconds_ago=_EARLIER)
    other_browser = token_for(user.id, issued_seconds_ago=_EARLIER)
    other_phone = await _phone_login(stack, user)

    body = await _turn_on(stack, user, caller)

    assert len(body["recovery_codes"]) == 8
    assert not await _works(stack, other_browser)
    assert not await _refreshes(stack, other_phone["refresh_token"])
    assert not await _works(stack, caller), "The token from before the change ends too."
    assert await _works(stack, body["access_token"]), "The caller stays signed in to save the codes."
    assert (await stack.stored_user(user.id)).totp_enabled


async def test_turning_2fa_off_on_a_phone_keeps_that_phone_signed_in(stack: RealAuthStack) -> None:
    user, secret = await _user_with_2fa(stack)
    this_phone = await _phone_login(stack, user, totp_code=current_code(secret))
    await stack.make_code_usable_again(user.id)
    other_phone = await _phone_login(stack, user, totp_code=current_code(secret))
    await stack.make_code_usable_again(user.id)
    other_browser = token_for(user.id, issued_seconds_ago=_EARLIER)
    # This phone's access token, from a few seconds ago.
    caller = token_for(
        user.id,
        issued_seconds_ago=_EARLIER,
        session_id=uuid.UUID(this_phone["session_id"]),
        lifetime_seconds=_PHONE_TOKEN_SECONDS,
    )

    response = await stack.client.post(
        "/auth/totp/disable", json={"code": current_code(secret)}, headers=_bearer(caller),
    )

    assert response.status_code == 200
    reissued = response.json()["access_token"]
    assert not await _works(stack, other_browser)
    assert not await _refreshes(stack, other_phone["refresh_token"])
    assert not await _works(stack, caller)
    assert await _works(stack, reissued)
    claims = jwt.decode(reissued, SECRET, algorithms=["HS256"], audience="fastapi-users:auth")
    assert claims["sid"] == this_phone["session_id"]
    assert claims["exp"] - claims["iat"] <= _PHONE_TOKEN_SECONDS + _EARLIER
    assert await _refreshes(stack, this_phone["refresh_token"]), "The phone keeps its sign-in."
    assert not (await stack.stored_user(user.id)).totp_enabled


async def test_turning_2fa_on_cant_keep_another_users_phone(stack: RealAuthStack) -> None:
    """The session kept is the caller's own, never one named by someone else's token."""
    user = await stack.add_user()
    stranger = await stack.add_user()
    stranger_phone = await _phone_login(stack, stranger)
    secret, _ = await stack.totp.setup_totp(user.id)

    verified, _ = await stack.totp.confirm_totp(
        user.id, current_code(secret), keep_session_id=uuid.UUID(stranger_phone["session_id"]),
    )

    assert verified
    sessions = await stack.stored_refresh_sessions(stranger.id)
    assert [session.created_at for session in sessions] == [sessions[0].created_at]
    assert sessions[0].created_at < (await stack.stored_user(user.id)).auth_valid_after
    assert await _refreshes(stack, stranger_phone["refresh_token"])


async def test_a_token_naming_another_users_phone_is_refused(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    stranger_phone = await _phone_login(stack, await stack.add_user())

    assert not await _works(stack, token_for(user.id, session_id=uuid.UUID(stranger_phone["session_id"])))


async def test_a_wrong_code_signs_nobody_out(stack: RealAuthStack) -> None:
    user, secret = await _user_with_2fa(stack)
    phone = await _phone_login(stack, user, totp_code=current_code(secret))
    browser = token_for(user.id, issued_seconds_ago=_EARLIER)

    response = await stack.client.post("/auth/totp/disable", json={"code": "000000"}, headers=_bearer(browser))

    assert response.status_code == 400
    assert await _works(stack, browser)
    assert await _refreshes(stack, phone["refresh_token"])
