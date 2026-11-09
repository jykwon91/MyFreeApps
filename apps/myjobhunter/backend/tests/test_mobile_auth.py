"""Mobile sign-in through the real app, database and bearer check."""
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.refresh_session import RefreshSession

_ME = "/users/me"


async def _sign_in(client: AsyncClient, user: dict, device_name: str = "Phone") -> dict:
    response = await client.post(
        "/auth/mobile/login",
        json={"email": user["email"], "password": user["password"], "device_name": device_name},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _bearer(tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def _refresh(client: AsyncClient, token: str):
    return await client.post("/auth/mobile/refresh", json={"refresh_token": token})


@pytest.mark.asyncio
async def test_a_phone_signs_in_refreshes_and_reaches_a_protected_route(client: AsyncClient, user_factory) -> None:
    tokens = await _sign_in(client, await user_factory())
    assert (await client.get(_ME, headers=_bearer(tokens))).status_code == 200

    refreshed = await _refresh(client, tokens["refresh_token"])
    assert refreshed.status_code == 200
    assert (await client.get(_ME, headers=_bearer(refreshed.json()))).status_code == 200
    assert refreshed.json()["refresh_token"] != tokens["refresh_token"]


@pytest.mark.asyncio
async def test_a_stolen_token_ends_the_session(client: AsyncClient, user_factory) -> None:
    stolen = (await _sign_in(client, await user_factory()))["refresh_token"]
    owners = (await _refresh(client, stolen)).json()["refresh_token"]
    assert (await _refresh(client, stolen)).status_code == 200  # the thief gets in

    refused = await _refresh(client, owners)
    assert refused.status_code == 401
    assert refused.json()["detail"] == "refresh_invalid"
    # Anyone still holding this session is out too.
    assert (await _refresh(client, stolen)).status_code == 401


@pytest.mark.asyncio
async def test_signing_out_ends_the_session(client: AsyncClient, user_factory) -> None:
    tokens = await _sign_in(client, await user_factory())
    response = await client.post("/auth/mobile/logout", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 204
    assert (await _refresh(client, tokens["refresh_token"])).status_code == 401


@pytest.mark.asyncio
async def test_devices_are_listed_and_only_the_owner_can_remove_one(client: AsyncClient, user_factory) -> None:
    owner = await user_factory()
    phone = await _sign_in(client, owner, "Phone")
    tablet = await _sign_in(client, owner, "Tablet")
    other = await _sign_in(client, await user_factory())

    listed = await client.get("/auth/mobile/sessions", headers=_bearer(phone))
    assert {row["device_name"] for row in listed.json()} == {"Phone", "Tablet"}

    path = f"/auth/mobile/sessions/{tablet['session_id']}"
    assert (await client.delete(path, headers=_bearer(other))).status_code == 404
    assert (await _refresh(client, tablet["refresh_token"])).status_code == 200
    assert (await client.delete(path, headers=_bearer(phone))).status_code == 204


@pytest.mark.asyncio
async def test_a_login_with_a_wrong_password_creates_no_session(
    client: AsyncClient, db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    response = await client.post(
        "/auth/mobile/login", json={"email": user["email"], "password": "wrong-password-here"},
    )
    assert response.status_code == 400
    rows = await db.execute(select(RefreshSession).where(RefreshSession.user_id == uuid.UUID(str(user["id"]))))
    assert rows.first() is None
