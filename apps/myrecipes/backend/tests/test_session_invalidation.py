"""Resetting a password signs out every token issued before it."""
import time
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

import app.core.auth as auth_module
from app.main import app

NEW_PASSWORD = "a-brand-new-long-password"


async def _login(email: str, password: str) -> str:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as anonymous:
        resp = await anonymous.post("/auth/jwt/login", data={"username": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


async def _status_of_me(token: str) -> int:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as authed:
        return (await authed.get("/users/me")).status_code


async def _reset_password(email: str, new_password: str, monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[str] = []
    monkeypatch.setattr(auth_module, "send_password_reset_email", lambda _email, token: sent.append(token))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as anonymous:
        await anonymous.post("/auth/forgot-password", json={"email": email})
        resp = await anonymous.post("/auth/reset-password", json={"token": sent[0], "password": new_password})
    assert resp.status_code == 200, resp.text


async def test_password_reset_ends_older_sessions_but_not_the_next_login(
    user_factory: Any, monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await user_factory()
    real_time = time.time
    with monkeypatch.context() as earlier:
        earlier.setattr("platform_shared.auth.jwt_backend.time.time", lambda: real_time() - 5)
        old_token = await _login(user["email"], user["password"])
    assert await _status_of_me(old_token) == 200

    await _reset_password(user["email"], NEW_PASSWORD, monkeypatch)

    assert await _status_of_me(old_token) == 401
    assert await _status_of_me(await _login(user["email"], NEW_PASSWORD)) == 200


async def test_sessions_keep_working_when_the_password_has_not_changed(user_factory: Any) -> None:
    user = await user_factory()
    assert await _status_of_me(await _login(user["email"], user["password"])) == 200
