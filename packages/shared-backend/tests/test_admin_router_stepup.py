"""Tests for the ``toggle_superuser`` strict-gate wiring in
``platform_shared.api.admin_router``.

The router gates ``PATCH /admin/users/{id}/superuser`` on the app's
``current_strict_superuser`` dependency (built from
``make_strict_superuser_gate``). The gate's own three-check semantics
(is_superuser + recent iat + valid X-TOTP-Code) are tested in
``test_permissions.py``. This file verifies only the router-level
contract: gate failure → 401/403 surface, gate pass → service runs.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient

from platform_shared.api.admin_router import build_admin_router
from platform_shared.core.permissions import Role
from platform_shared.services.admin_user_service import AdminUserService


class _FakeUser:
    def __init__(
        self,
        *,
        id: uuid.UUID | None = None,
        role: Role = Role.ADMIN,
        is_superuser: bool = True,
        is_active: bool = True,
        is_verified: bool = True,
        email: str = "admin@example.com",
        name: str = "Admin",
    ) -> None:
        self.id = id or uuid.uuid4()
        self.role = role
        self.is_superuser = is_superuser
        self.is_active = is_active
        self.is_verified = is_verified
        self.email = email
        self.name = name


def _build_app(
    *,
    target_user: _FakeUser,
    admin_user: _FakeUser,
    strict_gate_outcome: HTTPException | None,
) -> FastAPI:
    """Build a FastAPI app whose strict gate either passes (returns the
    admin) or fails (raises the supplied HTTPException).
    """
    fake_db = MagicMock(name="db")

    @asynccontextmanager
    async def fake_uow():
        yield fake_db

    @asynccontextmanager
    async def fake_factory():
        yield fake_db

    service = AdminUserService(
        user_model=_FakeUser,
        unit_of_work=fake_uow,
        async_session_factory=fake_factory,
    )

    async def fake_current_admin() -> _FakeUser:
        return admin_user

    async def fake_current_strict_superuser() -> _FakeUser:
        if strict_gate_outcome is not None:
            raise strict_gate_outcome
        return admin_user

    from platform_shared.repositories import admin_user_repo

    admin_user_repo.get_by_id = AsyncMock(return_value=target_user)  # type: ignore[assignment]

    router = build_admin_router(
        service=service,
        current_admin=fake_current_admin,
        current_strict_superuser=fake_current_strict_superuser,
    )
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.mark.asyncio
async def test_toggle_superuser_returns_401_when_missing_totp_header() -> None:
    """Strict gate raises 401 with X-Require-Step-Up: totp → router surfaces 401."""
    target = _FakeUser(is_superuser=False)
    admin = _FakeUser()
    gate_outcome = HTTPException(
        status_code=401,
        detail="TOTP step-up required",
        headers={"X-Require-Step-Up": "totp"},
    )
    app = _build_app(
        target_user=target, admin_user=admin, strict_gate_outcome=gate_outcome,
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        resp = await client.patch(f"/admin/users/{target.id}/superuser")

    assert resp.status_code == 401
    assert resp.headers.get("X-Require-Step-Up") == "totp"
    assert resp.json()["detail"] == "TOTP step-up required"
    assert target.is_superuser is False


@pytest.mark.asyncio
async def test_toggle_superuser_returns_401_when_token_too_old() -> None:
    """Strict gate raises 401 with X-Require-Step-Up: reauth → router surfaces 401."""
    target = _FakeUser(is_superuser=False)
    admin = _FakeUser()
    gate_outcome = HTTPException(
        status_code=401,
        detail="Re-authenticate (session too old for this action)",
        headers={"X-Require-Step-Up": "reauth"},
    )
    app = _build_app(
        target_user=target, admin_user=admin, strict_gate_outcome=gate_outcome,
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        resp = await client.patch(
            f"/admin/users/{target.id}/superuser",
            headers={"X-TOTP-Code": "123456"},
        )

    assert resp.status_code == 401
    assert resp.headers.get("X-Require-Step-Up") == "reauth"
    assert target.is_superuser is False


@pytest.mark.asyncio
async def test_toggle_superuser_returns_403_when_not_superuser() -> None:
    """Strict gate raises 403 when calling user lacks is_superuser → router surfaces 403."""
    target = _FakeUser(is_superuser=False)
    admin = _FakeUser(is_superuser=False)
    gate_outcome = HTTPException(status_code=403, detail="Superuser access required")
    app = _build_app(
        target_user=target, admin_user=admin, strict_gate_outcome=gate_outcome,
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        resp = await client.patch(
            f"/admin/users/{target.id}/superuser",
            headers={"X-TOTP-Code": "123456"},
        )

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Superuser access required"
    assert target.is_superuser is False


@pytest.mark.asyncio
async def test_toggle_superuser_succeeds_when_strict_gate_passes() -> None:
    """Strict gate returns admin → service flips the flag."""
    target = _FakeUser(is_superuser=False)
    admin = _FakeUser()
    app = _build_app(
        target_user=target, admin_user=admin, strict_gate_outcome=None,
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        resp = await client.patch(
            f"/admin/users/{target.id}/superuser",
            headers={"X-TOTP-Code": "123456"},
        )

    assert resp.status_code == 200
    assert target.is_superuser is True


@pytest.mark.asyncio
async def test_toggle_superuser_no_body_field_required() -> None:
    """Empty body is accepted — TOTP travels in the X-TOTP-Code header,
    not in the request body. Belt-and-braces regression test against
    accidentally re-introducing a body schema.
    """
    target = _FakeUser(is_superuser=False)
    admin = _FakeUser()
    app = _build_app(
        target_user=target, admin_user=admin, strict_gate_outcome=None,
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        # Sending a body field at all (extra field) should not break
        # the request — the route does not declare a body model.
        resp = await client.patch(
            f"/admin/users/{target.id}/superuser",
            headers={"X-TOTP-Code": "123456"},
            json={"unrelated": "field"},
        )

    assert resp.status_code == 200
