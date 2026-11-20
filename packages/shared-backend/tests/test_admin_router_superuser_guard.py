"""A non-superuser admin gets 403 from the shared admin router when acting on a superuser."""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from platform_shared.api.admin_router import build_admin_router
from platform_shared.core.permissions import Role
from platform_shared.services.admin_user_service import AdminUserService


class _FakeUser:
    def __init__(self, *, is_superuser: bool) -> None:
        self.id = uuid.uuid4()
        self.role = Role.ADMIN
        self.is_superuser = is_superuser
        self.is_active = True
        self.is_verified = True
        self.email = "u@example.com"
        self.name = "User"


def _build_app(admin: _FakeUser) -> FastAPI:
    @asynccontextmanager
    async def fake_session():
        yield MagicMock(name="db")

    service = AdminUserService(
        user_model=_FakeUser,
        unit_of_work=fake_session,
        async_session_factory=fake_session,
    )

    async def current_admin() -> _FakeUser:
        return admin

    app = FastAPI()
    app.include_router(
        build_admin_router(
            service=service,
            current_admin=current_admin,
            current_strict_superuser=current_admin,
        ),
    )
    return app


_ACTIONS = [
    ("role", {"role": "user"}),
    ("deactivate", None),
    ("activate", None),
]


@pytest.mark.asyncio
@pytest.mark.parametrize(("path", "body"), _ACTIONS)
async def test_non_superuser_admin_gets_403_acting_on_superuser(path, body) -> None:
    target = _FakeUser(is_superuser=True)
    app = _build_app(_FakeUser(is_superuser=False))

    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.get_by_id",
        new=AsyncMock(return_value=target),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            resp = await client.patch(f"/admin/users/{target.id}/{path}", json=body)

    assert resp.status_code == 403
    assert target.is_active is True
    assert target.role == Role.ADMIN


@pytest.mark.asyncio
async def test_non_superuser_admin_can_deactivate_plain_user() -> None:
    target = _FakeUser(is_superuser=False)
    app = _build_app(_FakeUser(is_superuser=False))

    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.get_by_id",
        new=AsyncMock(return_value=target),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            resp = await client.patch(f"/admin/users/{target.id}/deactivate")

    assert resp.status_code == 200
    assert target.is_active is False
