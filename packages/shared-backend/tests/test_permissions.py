"""Unit tests for platform_shared.core.permissions."""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from platform_shared.core.permissions import Role, require_role


class _FakeUser:
    """Stand-in for an app's User model — only needs a `role` attribute."""

    def __init__(self, role: Role) -> None:
        self.role = role


class TestRoleEnum:
    def test_admin_value(self) -> None:
        assert Role.ADMIN.value == "admin"

    def test_user_value(self) -> None:
        assert Role.USER.value == "user"

    def test_two_values_only(self) -> None:
        assert set(Role) == {Role.ADMIN, Role.USER}

    def test_str_subclass(self) -> None:
        # Role inherits from str so JSON serialisation works without a custom encoder.
        assert isinstance(Role.ADMIN, str)
        assert Role.ADMIN == "admin"


class TestRequireRole:
    def _build_app(self, *, allowed_roles: tuple[Role, ...], user_role: Role) -> FastAPI:
        app = FastAPI()

        async def fake_current_active_user() -> _FakeUser:
            return _FakeUser(role=user_role)

        gate = require_role(
            *allowed_roles, current_active_user=fake_current_active_user
        )

        @app.get("/protected")
        async def protected(user: _FakeUser = Depends(gate)) -> dict:
            return {"role": user.role.value}

        return app

    def test_admin_passes_admin_gate(self) -> None:
        app = self._build_app(allowed_roles=(Role.ADMIN,), user_role=Role.ADMIN)
        client = TestClient(app)
        resp = client.get("/protected")
        assert resp.status_code == 200
        assert resp.json() == {"role": "admin"}

    def test_user_blocked_from_admin_gate(self) -> None:
        app = self._build_app(allowed_roles=(Role.ADMIN,), user_role=Role.USER)
        client = TestClient(app)
        resp = client.get("/protected")
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Insufficient permissions"

    def test_admin_passes_admin_or_user_gate(self) -> None:
        app = self._build_app(
            allowed_roles=(Role.ADMIN, Role.USER), user_role=Role.ADMIN
        )
        client = TestClient(app)
        resp = client.get("/protected")
        assert resp.status_code == 200

    def test_user_passes_admin_or_user_gate(self) -> None:
        app = self._build_app(
            allowed_roles=(Role.ADMIN, Role.USER), user_role=Role.USER
        )
        client = TestClient(app)
        resp = client.get("/protected")
        assert resp.status_code == 200
