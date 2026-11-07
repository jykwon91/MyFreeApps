"""Serve-only prod's operator sign-in: what is mounted, that it works, and that
boot refuses to start without the operator account.

The absent half (register / reset / verify / write routers 404) is pinned in
``test_auth_gating.py::test_serve_only_auth_routes_not_mounted``; the triage
gate itself in ``test_wow_feature_triage_api.py``.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi_users.password import PasswordHelper
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app import main
from app.models.user.user import User
from app.services.user.seed_user_service import SeedUserNotConfiguredError

OPERATOR_EMAIL = "serve-only-operator@example.com"
FIXTURE_PASSWORD = "fixture-password-123!"


@pytest_asyncio.fixture
async def operator(db: AsyncSession) -> User:
    user = User(
        email=OPERATOR_EMAIL,
        hashed_password=PasswordHelper().hash(FIXTURE_PASSWORD),
        is_active=True,
        is_verified=True,
        is_superuser=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _sign_in(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/auth/totp/login", json={"email": OPERATOR_EMAIL, "password": FIXTURE_PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


async def test_operator_signs_in_and_reads_users_me(serve_only_client: AsyncClient, operator: User) -> None:
    token = await _sign_in(serve_only_client)
    me = await serve_only_client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    assert me.json()["email"] == OPERATOR_EMAIL
    assert me.json()["is_superuser"] is True


async def test_jwt_login_and_logout_are_mounted(serve_only_client: AsyncClient, operator: User) -> None:
    login = await serve_only_client.post(
        "/api/auth/jwt/login",
        data={"username": OPERATOR_EMAIL, "password": FIXTURE_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    logout = await serve_only_client.post("/api/auth/jwt/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout.status_code in (200, 204), logout.text


async def test_wrong_password_is_refused(serve_only_client: AsyncClient, operator: User) -> None:
    resp = await serve_only_client.post(
        "/api/auth/totp/login", json={"email": OPERATOR_EMAIL, "password": "fixture-wrong-password"}
    )
    assert resp.status_code == 400


@pytest.mark.parametrize(
    "method, path",
    [
        ("GET", "/api/users/me"),
        ("GET", "/api/auth/totp/status"),
        ("POST", "/api/auth/totp/setup"),
        ("POST", "/api/auth/totp/verify"),
        ("POST", "/api/auth/totp/disable"),
    ],
)
async def test_operator_routes_need_a_session(serve_only_client: AsyncClient, method: str, path: str) -> None:
    """Mounted (not 404) and signed-out callers are refused."""
    resp = await serve_only_client.request(method, path, json={})
    assert resp.status_code == 401, resp.text


async def test_operator_can_reach_2fa_settings(serve_only_client: AsyncClient, operator: User) -> None:
    token = await _sign_in(serve_only_client)
    status = await serve_only_client.get("/api/auth/totp/status", headers={"Authorization": f"Bearer {token}"})
    assert status.status_code == 200, status.text
    assert status.json() == {"enabled": False}


async def test_serve_only_production_boot_requires_the_operator(monkeypatch: pytest.MonkeyPatch) -> None:
    """Serve-only no longer skips the seed: prod without SEED_USER_* refuses to boot."""
    monkeypatch.setattr(main.settings, "serve_only", True)
    monkeypatch.setattr(main.settings, "environment", "production")
    monkeypatch.setattr(main.settings, "seed_user_email", "")
    monkeypatch.setattr(main.settings, "seed_user_password_hash", "")
    with pytest.raises(SeedUserNotConfiguredError, match="SERVE_ONLY=true"):
        await main._on_startup()
