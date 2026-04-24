"""Auth flow: register → login → /users/me → logout."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient, user_factory) -> None:
    user = await user_factory()
    assert "id" in user
    assert user["email"].endswith("@example.com")


@pytest.mark.asyncio
async def test_login_returns_token(client: AsyncClient, user_factory) -> None:
    user = await user_factory()
    resp = await client.post(
        "/auth/jwt/login",
        data={"username": user["email"], "password": user["password"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_me_endpoint(client: AsyncClient, user_factory, as_user) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        resp = await authed.get("/users/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == user["email"]
    assert body["id"] == user["id"]


@pytest.mark.asyncio
async def test_me_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/users/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_short_password_rejected(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/register",
        json={"email": "short@example.com", "password": "short"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, user_factory, as_user) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        resp = await authed.post("/auth/jwt/logout")
    # fastapi-users returns 204 No Content on successful JWT logout
    assert resp.status_code == 204
