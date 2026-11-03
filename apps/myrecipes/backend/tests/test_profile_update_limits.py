"""A signed-in token can't change credentials or privileges through a profile update."""
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.models.user.user import User


async def _login_status(email: str, password: str) -> int:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as anonymous:
        resp = await anonymous.post("/auth/jwt/login", data={"username": email, "password": password})
    return resp.status_code


async def test_email_cant_be_changed_with_a_token(user_factory: Any, as_user: Any) -> None:
    user = await user_factory()
    async with await as_user(user) as client:
        resp = await client.patch("/users/me", json={"email": "attacker@example.com"})
        me = await client.get("/users/me")
    assert resp.status_code == 422
    assert me.json()["email"] == user["email"]


async def test_password_cant_be_changed_with_a_token(user_factory: Any, as_user: Any) -> None:
    user = await user_factory()
    async with await as_user(user) as client:
        resp = await client.patch("/users/me", json={"password": "a-brand-new-long-password"})
    assert resp.status_code == 422
    assert await _login_status(user["email"], user["password"]) == 200


async def test_display_name_alongside_email_changes_nothing(user_factory: Any, as_user: Any) -> None:
    async with await as_user(await user_factory()) as client:
        await client.patch("/users/me", json={"display_name": "Ada"})
        resp = await client.patch(
            "/users/me", json={"display_name": "Mallory", "email": "attacker@example.com"},
        )
        me = await client.get("/users/me")
    assert resp.status_code == 422
    assert me.json()["display_name"] == "Ada"


@pytest.mark.parametrize(
    "body",
    [{"is_superuser": True}, {"is_active": False}, {"email": "other@example.com"}],
    ids=["is_superuser", "is_active", "email"],
)
async def test_superuser_route_cant_skip_the_admin_gate(
    user_factory: Any, as_user: Any, db: AsyncSession, body: dict[str, object],
) -> None:
    admin = await user_factory()
    await db.execute(update(User).where(User.email == admin["email"]).values(is_superuser=True))
    await db.commit()
    target = await user_factory()
    async with await as_user(target) as target_client:
        target_id = (await target_client.get("/users/me")).json()["id"]

    async with await as_user(admin) as client:
        resp = await client.patch(f"/users/{target_id}", json=body)
        after = await client.get(f"/users/{target_id}")

    assert resp.status_code == 422
    assert after.status_code == 200
    assert after.json()["is_superuser"] is False
    assert after.json()["is_active"] is True
    assert after.json()["email"] == target["email"]
