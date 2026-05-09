"""Unit tests for platform_shared.core.permissions."""

from __future__ import annotations

import time

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from platform_shared.core.permissions import (
    Role,
    make_current_superuser,
    require_role,
)


class _FakeUser:
    """Stand-in for an app's User model — only needs a `role` attribute."""

    def __init__(self, role: Role, *, is_superuser: bool = False) -> None:
        self.role = role
        self.is_superuser = is_superuser


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


class TestMakeCurrentSuperuser:
    def _build_app(self, *, is_superuser: bool) -> FastAPI:
        app = FastAPI()

        async def fake_current_active_user() -> _FakeUser:
            return _FakeUser(role=Role.USER, is_superuser=is_superuser)

        gate = make_current_superuser(fake_current_active_user)

        @app.get("/superuser-only")
        async def protected(user: _FakeUser = Depends(gate)) -> dict:
            return {"is_superuser": user.is_superuser}

        return app

    def test_superuser_passes(self) -> None:
        client = TestClient(self._build_app(is_superuser=True))
        resp = client.get("/superuser-only")
        assert resp.status_code == 200
        assert resp.json() == {"is_superuser": True}

    def test_non_superuser_blocked(self) -> None:
        client = TestClient(self._build_app(is_superuser=False))
        resp = client.get("/superuser-only")
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Superuser access required"


class TestMakeStrictSuperuserGate:
    """Contract tests for the hardened strict-superuser gate.

    The gate evaluates three independent layers (is_superuser → recent-auth →
    TOTP step-up) and emits an auth_event row on every evaluation. These
    tests verify each gate's pass/fail path and confirm the audit-event
    fan-out so future refactors can't silently drop a gate.
    """

    def _build_app(
        self,
        *,
        is_superuser: bool,
        token_iat: float | None,
        good_totp: str | None = "123456",
        max_token_age_seconds: int = 900,
    ):
        """Build a FastAPI app + a list capturing every audit-event emission.

        The verifier accepts only ``"123456"`` so tests can prove the gate
        forwards the user-supplied code into the verifier.
        """
        import uuid as _uuid

        from platform_shared.core.permissions import make_strict_superuser_gate

        app = FastAPI()
        events: list[dict] = []
        user_id = _uuid.uuid4()

        async def fake_current_active_user() -> _FakeUser:
            user = _FakeUser(role=Role.USER, is_superuser=is_superuser)
            user.id = user_id  # type: ignore[attr-defined]
            return user

        class _FakeDb:
            """Stand-in for AsyncSession — only ``add`` is exercised."""

            def add(self, obj: object) -> None:
                events.append(
                    {
                        "event_type": getattr(obj, "event_type", None),
                        "user_id": getattr(obj, "user_id", None),
                        "succeeded": getattr(obj, "succeeded", None),
                        "metadata": getattr(obj, "event_metadata", None),
                    }
                )

        async def fake_get_db():
            yield _FakeDb()

        async def fake_verify_totp(_db, _uid, code: str) -> None:
            if code != good_totp:
                raise HTTPException(status_code=401, detail="Invalid TOTP code")

        def fake_decode_iat(_request) -> float | None:
            return token_iat

        gate = make_strict_superuser_gate(
            current_active_user=fake_current_active_user,
            get_db=fake_get_db,
            verify_totp_step_up=fake_verify_totp,
            decode_token_iat=fake_decode_iat,
            max_token_age_seconds=max_token_age_seconds,
        )

        @app.delete("/superuser-action")
        async def superuser_action(
            user: _FakeUser = Depends(gate),
        ) -> dict:
            return {"id": str(user.id)}

        return app, events, user_id

    def test_passes_when_all_three_gates_satisfied(self) -> None:
        from platform_shared.core.auth_events import AuthEventType

        app, events, user_id = self._build_app(
            is_superuser=True, token_iat=time.time() - 60
        )
        client = TestClient(app)
        resp = client.delete("/superuser-action", headers={"X-TOTP-Code": "123456"})
        assert resp.status_code == 200
        assert resp.json() == {"id": str(user_id)}
        assert len(events) == 1
        assert events[0]["event_type"] == AuthEventType.SUPERUSER_GATE_PASSED
        assert events[0]["succeeded"] is True
        assert events[0]["metadata"]["path"] == "/superuser-action"

    def test_blocks_non_superuser_with_audit(self) -> None:
        from platform_shared.core.auth_events import AuthEventType

        app, events, _user_id = self._build_app(
            is_superuser=False, token_iat=time.time() - 60
        )
        client = TestClient(app)
        resp = client.delete("/superuser-action", headers={"X-TOTP-Code": "123456"})
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Superuser access required"
        assert len(events) == 1
        assert (
            events[0]["event_type"]
            == AuthEventType.SUPERUSER_GATE_DENIED_NOT_SUPERUSER
        )
        assert events[0]["succeeded"] is False

    def test_blocks_when_token_has_no_iat(self) -> None:
        from platform_shared.core.auth_events import AuthEventType

        app, events, _user_id = self._build_app(
            is_superuser=True, token_iat=None
        )
        client = TestClient(app)
        resp = client.delete("/superuser-action", headers={"X-TOTP-Code": "123456"})
        assert resp.status_code == 401
        assert "iat" in resp.json()["detail"].lower()
        assert len(events) == 1
        assert (
            events[0]["event_type"]
            == AuthEventType.SUPERUSER_GATE_DENIED_TOKEN_NO_IAT
        )

    def test_blocks_when_token_too_old(self) -> None:
        from platform_shared.core.auth_events import AuthEventType

        # Token issued 30 minutes ago, window is default 15 minutes
        app, events, _user_id = self._build_app(
            is_superuser=True,
            token_iat=time.time() - 1800,
            max_token_age_seconds=900,
        )
        client = TestClient(app)
        resp = client.delete("/superuser-action", headers={"X-TOTP-Code": "123456"})
        assert resp.status_code == 401
        assert "session too old" in resp.json()["detail"].lower()
        assert resp.headers.get("X-Require-Step-Up") == "reauth"
        assert len(events) == 1
        assert (
            events[0]["event_type"]
            == AuthEventType.SUPERUSER_GATE_DENIED_TOKEN_STALE
        )
        assert events[0]["metadata"]["max_age_s"] == 900
        assert events[0]["metadata"]["age_s"] >= 1800

    def test_blocks_when_totp_header_missing(self) -> None:
        from platform_shared.core.auth_events import AuthEventType

        app, events, _user_id = self._build_app(
            is_superuser=True, token_iat=time.time() - 60
        )
        client = TestClient(app)
        resp = client.delete("/superuser-action")  # no X-TOTP-Code
        assert resp.status_code == 401
        assert resp.json()["detail"] == "TOTP step-up required"
        assert resp.headers.get("X-Require-Step-Up") == "totp"
        assert len(events) == 1
        assert (
            events[0]["event_type"]
            == AuthEventType.SUPERUSER_GATE_DENIED_MISSING_TOTP
        )

    def test_blocks_when_totp_invalid(self) -> None:
        from platform_shared.core.auth_events import AuthEventType

        app, events, _user_id = self._build_app(
            is_superuser=True, token_iat=time.time() - 60
        )
        client = TestClient(app)
        resp = client.delete(
            "/superuser-action", headers={"X-TOTP-Code": "000000"}
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid TOTP code"
        assert len(events) == 1
        assert (
            events[0]["event_type"] == AuthEventType.SUPERUSER_GATE_DENIED_BAD_TOTP
        )

    def test_evaluates_gates_in_order_is_superuser_first(self) -> None:
        """Non-superuser short-circuits before token/TOTP evaluation.

        Belt-and-suspenders: prevents accidental info-leak ("the user wasn't
        superuser BUT their TOTP was wrong" → caller learns is_superuser=False
        from the wrong-error-code). Strict gate denies on first failure.
        """
        from platform_shared.core.auth_events import AuthEventType

        # Non-superuser, AND no token, AND no TOTP — should fail on gate 1
        # (NOT_SUPERUSER), not token-iat or missing-TOTP.
        app, events, _user_id = self._build_app(
            is_superuser=False, token_iat=None
        )
        client = TestClient(app)
        resp = client.delete("/superuser-action")
        assert resp.status_code == 403
        assert (
            events[-1]["event_type"]
            == AuthEventType.SUPERUSER_GATE_DENIED_NOT_SUPERUSER
        )

    def test_evaluates_token_age_before_totp(self) -> None:
        """Stale token short-circuits before TOTP evaluation."""
        from platform_shared.core.auth_events import AuthEventType

        # Superuser, but token stale, AND no TOTP — should fail on gate 2
        # (TOKEN_STALE), not gate 3 (MISSING_TOTP).
        app, events, _user_id = self._build_app(
            is_superuser=True,
            token_iat=time.time() - 3600,
            max_token_age_seconds=900,
        )
        client = TestClient(app)
        resp = client.delete("/superuser-action")
        assert resp.status_code == 401
        assert (
            events[-1]["event_type"]
            == AuthEventType.SUPERUSER_GATE_DENIED_TOKEN_STALE
        )

    def test_no_audit_event_for_other_routes(self) -> None:
        """Sanity check: gate is dependency-scoped, doesn't fire on
        unrelated routes.
        """
        app, events, _user_id = self._build_app(
            is_superuser=True, token_iat=time.time() - 60
        )

        @app.get("/public")
        async def public() -> dict:
            return {"ok": True}

        client = TestClient(app)
        resp = client.get("/public")
        assert resp.status_code == 200
        assert events == []

    def test_token_age_just_under_window_passes(self) -> None:
        """Boundary: a token aged exactly window_seconds-1 is still fresh."""
        from platform_shared.core.auth_events import AuthEventType

        app, events, _user_id = self._build_app(
            is_superuser=True,
            token_iat=time.time() - 899,  # 899s old, 900s window
            max_token_age_seconds=900,
        )
        client = TestClient(app)
        resp = client.delete("/superuser-action", headers={"X-TOTP-Code": "123456"})
        assert resp.status_code == 200
        assert events[-1]["event_type"] == AuthEventType.SUPERUSER_GATE_PASSED
