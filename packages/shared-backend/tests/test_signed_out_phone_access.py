"""A phone that is signed out loses access at once, not when its access token expires.

Requests here are authenticated by their tokens, as in an app.
"""
from collections.abc import AsyncIterator
from typing import Any

import pytest_asyncio

from tests.real_auth_stack import PASSWORD, RealAuthStack, StackUser, make_stack, token_for

_STATUS = "/auth/totp/status"


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


async def _phone_login(stack: RealAuthStack, user: StackUser) -> dict[str, Any]:
    response = await stack.client.post(
        "/auth/mobile/login", json={"email": user.email, "password": PASSWORD, "device_name": "Phone"},
    )
    assert response.status_code == 200
    return response.json()


async def test_a_device_signed_out_from_another_loses_access_at_once(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    lost_phone = await _phone_login(stack, user)
    this_phone = await _phone_login(stack, user)
    browser = token_for(user.id)
    assert await _works(stack, lost_phone["access_token"])

    response = await stack.client.delete(
        f"/auth/mobile/sessions/{lost_phone['session_id']}", headers=_bearer(this_phone["access_token"]),
    )

    assert response.status_code == 204
    assert not await _works(stack, lost_phone["access_token"])
    assert await _works(stack, this_phone["access_token"]), "Other phones stay signed in."
    assert await _works(stack, browser), "Browsers stay signed in."


async def test_signing_out_on_the_phone_ends_its_access_token(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    phone = await _phone_login(stack, user)

    response = await stack.client.post("/auth/mobile/logout", json={"refresh_token": phone["refresh_token"]})

    assert response.status_code == 204
    assert not await _works(stack, phone["access_token"])


async def test_a_refreshed_phone_keeps_working(stack: RealAuthStack) -> None:
    user = await stack.add_user()
    phone = await _phone_login(stack, user)

    refreshed = await stack.client.post("/auth/mobile/refresh", json={"refresh_token": phone["refresh_token"]})

    assert refreshed.status_code == 200
    assert await _works(stack, refreshed.json()["access_token"])
