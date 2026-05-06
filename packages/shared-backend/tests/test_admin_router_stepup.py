"""Tests for the ``toggle_superuser`` step-up gate in
``platform_shared.api.admin_router``.

Verifies that the router refuses to flip ``is_superuser`` without a
valid TOTP code, and that the validation surfaces as the right HTTP
status. Service-layer behaviour (self-target, missing-user, etc.) is
tested separately in ``test_admin_user_service.py``.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
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
    step_up_verify: AsyncMock,
) -> FastAPI:
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

    # Patch the repo on the imported module — must match the path the
    # service uses internally.
    from platform_shared.repositories import admin_user_repo

    admin_user_repo.get_by_id = AsyncMock(return_value=target_user)  # type: ignore[assignment]

    router = build_admin_router(
        service=service,
        current_admin=fake_current_admin,
        step_up_verify=step_up_verify,
    )
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.mark.asyncio
async def test_toggle_superuser_rejects_missing_totp_code() -> None:
    """No body → 422 (Pydantic validation; totp_code is required)."""
    target = _FakeUser(is_superuser=False)
    admin = _FakeUser()
    verifier = AsyncMock(return_value=True)
    app = _build_app(target_user=target, admin_user=admin, step_up_verify=verifier)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        resp = await client.patch(
            f"/admin/users/{target.id}/superuser",
            json={},
        )
    assert resp.status_code == 422
    assert verifier.await_count == 0
    assert target.is_superuser is False


@pytest.mark.asyncio
async def test_toggle_superuser_rejects_invalid_totp_code() -> None:
    """Step-up verifier returns False → 403 step_up_failed."""
    target = _FakeUser(is_superuser=False)
    admin = _FakeUser()
    verifier = AsyncMock(return_value=False)
    app = _build_app(target_user=target, admin_user=admin, step_up_verify=verifier)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        resp = await client.patch(
            f"/admin/users/{target.id}/superuser",
            json={"totp_code": "000000"},
        )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "step_up_failed"
    verifier.assert_awaited_once_with(admin, "000000")
    # Service must NOT have flipped the flag.
    assert target.is_superuser is False


@pytest.mark.asyncio
async def test_toggle_superuser_succeeds_with_valid_totp_code() -> None:
    """Step-up verifier returns True → service flips the flag."""
    target = _FakeUser(is_superuser=False)
    admin = _FakeUser()
    verifier = AsyncMock(return_value=True)
    app = _build_app(target_user=target, admin_user=admin, step_up_verify=verifier)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        resp = await client.patch(
            f"/admin/users/{target.id}/superuser",
            json={"totp_code": "123456"},
        )
    assert resp.status_code == 200
    verifier.assert_awaited_once_with(admin, "123456")
    assert target.is_superuser is True


@pytest.mark.asyncio
async def test_toggle_superuser_step_up_runs_before_self_target_check() -> None:
    """Self-target attempts must still pay the step-up cost.

    Belt-and-braces: even if a malicious flow somehow bypasses the
    service-layer self-target guard, the step-up gate fires first.
    """
    admin = _FakeUser()
    verifier = AsyncMock(return_value=False)
    # target == admin — service would raise ValueError, but we should
    # 403 on step-up failure FIRST and never reach the service.
    app = _build_app(target_user=admin, admin_user=admin, step_up_verify=verifier)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        resp = await client.patch(
            f"/admin/users/{admin.id}/superuser",
            json={"totp_code": "wrong"},
        )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "step_up_failed"
