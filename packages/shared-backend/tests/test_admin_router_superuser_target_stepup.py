"""Acting on a superuser through the shared admin router needs the strict gate.

Deactivate, activate and role changes on a superuser must pass the same step-up
as the superuser toggle (recent auth + TOTP code). Acting on a normal user keeps
the routine admin check. The real ``make_strict_superuser_gate`` is wired in.
"""
from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient

from platform_shared.api.admin_router import build_admin_router
from platform_shared.core.auth_events import AuthEventType
from platform_shared.core.permissions import Role, make_strict_superuser_gate
from platform_shared.services.admin_user_service import AdminUserService
from platform_shared.services.guard_outcome import GuardOutcome

GOOD_CODE = "123456"
TOTP_HEADERS = {"X-TOTP-Code": GOOD_CODE}


class _FakeUser:
    def __init__(self, *, is_superuser: bool) -> None:
        self.id = uuid.uuid4()
        self.role = Role.ADMIN
        self.is_superuser = is_superuser
        self.is_active = True
        self.is_verified = True
        self.email = "u@example.com"
        self.name = "User"


class _FakeDb:
    new: tuple[object, ...] = ()
    dirty: tuple[object, ...] = ()
    deleted: tuple[object, ...] = ()

    async def commit(self) -> None:
        return None

    def add(self, obj: object) -> None:
        return None


class _FakeGuard:
    def __init__(self) -> None:
        self.spent_codes: list[str] = []

    async def spend_step_up_code(self, uid, code, verify, *, request=None) -> GuardOutcome:
        self.spent_codes.append(code)
        return GuardOutcome.ALLOWED if await verify(None, uid, code) else GuardOutcome.WRONG


class _FakeUserManager:
    def __init__(self, guard: _FakeGuard) -> None:
        self.account_guard = guard


class _Harness:
    """The app plus what the gate recorded."""

    def __init__(self, app: FastAPI, guard: _FakeGuard, events: AsyncMock) -> None:
        self.app = app
        self.guard = guard
        self.events = events

    @property
    def event_types(self) -> list[AuthEventType]:
        return [call.kwargs["event_type"] for call in self.events.call_args_list]


def _build(
    caller: _FakeUser,
    *,
    admin_check: Callable[[], Awaitable[_FakeUser]] | None = None,
    auth_age_seconds: float = 60,
) -> _Harness:
    @asynccontextmanager
    async def fake_session():
        yield MagicMock(name="db")

    service = AdminUserService(
        user_model=_FakeUser,
        unit_of_work=fake_session,
        async_session_factory=fake_session,
    )
    guard = _FakeGuard()

    async def current_active_user() -> _FakeUser:
        return caller

    async def current_admin() -> _FakeUser:
        return caller

    async def get_db():
        yield _FakeDb()

    async def get_user_manager() -> _FakeUserManager:
        return _FakeUserManager(guard)

    async def verify_totp(_db, _uid, code: str) -> bool:
        return code == GOOD_CODE

    gate = make_strict_superuser_gate(
        current_active_user=current_active_user,
        get_db=get_db,
        get_user_manager=get_user_manager,
        verify_totp_step_up=verify_totp,
        decode_token_auth_time=lambda _request: time.time() - auth_age_seconds,
    )
    app = FastAPI()
    app.include_router(
        build_admin_router(
            service=service,
            current_admin=admin_check or current_admin,
            current_strict_superuser=gate,
        ),
    )
    return _Harness(app, guard, AsyncMock())


async def _patch_user(
    harness: _Harness, target: _FakeUser | None, path: str, body, headers=None,
    *, target_id: uuid.UUID | None = None,
):
    user_id = target_id or (target.id if target else uuid.uuid4())
    with (
        patch(
            "platform_shared.services.admin_user_service.admin_user_repo.get_by_id",
            new=AsyncMock(return_value=target),
        ),
        patch("platform_shared.core.permissions.release_connection", new=AsyncMock()),
        patch("platform_shared.core.permissions.log_auth_event", new=harness.events),
    ):
        async with AsyncClient(transport=ASGITransport(app=harness.app), base_url="http://t") as client:
            return await client.patch(
                f"/admin/users/{user_id}/{path}", json=body, headers=headers or {},
            )


_ACTIONS = [
    ("role", {"role": "user"}),
    ("deactivate", None),
    ("activate", None),
]


@pytest.mark.asyncio
@pytest.mark.parametrize(("path", "body"), _ACTIONS)
async def test_superuser_without_step_up_is_refused_for_superuser_target(path, body) -> None:
    target = _FakeUser(is_superuser=True)
    harness = _build(_FakeUser(is_superuser=True))

    resp = await _patch_user(harness, target, path, body)

    assert resp.status_code == 401
    assert resp.headers["X-Require-Step-Up"] == "totp"
    assert target.is_active is True
    assert target.role == Role.ADMIN


@pytest.mark.asyncio
@pytest.mark.parametrize(("path", "body"), _ACTIONS)
async def test_superuser_with_wrong_code_is_refused_for_superuser_target(path, body) -> None:
    target = _FakeUser(is_superuser=True)
    harness = _build(_FakeUser(is_superuser=True))

    resp = await _patch_user(harness, target, path, body, {"X-TOTP-Code": "000000"})

    assert resp.status_code == 401
    assert target.is_active is True
    assert target.role == Role.ADMIN


@pytest.mark.asyncio
async def test_stale_sign_in_is_refused_for_superuser_target() -> None:
    target = _FakeUser(is_superuser=True)
    harness = _build(_FakeUser(is_superuser=True), auth_age_seconds=10_000)

    resp = await _patch_user(harness, target, "deactivate", None, TOTP_HEADERS)

    assert resp.status_code == 401
    assert resp.headers["X-Require-Step-Up"] == "reauth"
    assert target.is_active is True


@pytest.mark.asyncio
async def test_superuser_with_step_up_can_deactivate_superuser() -> None:
    target = _FakeUser(is_superuser=True)
    harness = _build(_FakeUser(is_superuser=True))

    resp = await _patch_user(harness, target, "deactivate", None, TOTP_HEADERS)

    assert resp.status_code == 200
    assert target.is_active is False
    assert harness.guard.spent_codes == [GOOD_CODE]
    assert AuthEventType.SUPERUSER_GATE_PASSED in harness.event_types


@pytest.mark.asyncio
async def test_superuser_with_step_up_can_activate_superuser() -> None:
    target = _FakeUser(is_superuser=True)
    target.is_active = False
    harness = _build(_FakeUser(is_superuser=True))

    resp = await _patch_user(harness, target, "activate", None, TOTP_HEADERS)

    assert resp.status_code == 200
    assert target.is_active is True
    assert harness.guard.spent_codes == [GOOD_CODE]


@pytest.mark.asyncio
async def test_superuser_with_step_up_can_change_superuser_role() -> None:
    target = _FakeUser(is_superuser=True)
    harness = _build(_FakeUser(is_superuser=True))

    resp = await _patch_user(harness, target, "role", {"role": "user"}, TOTP_HEADERS)

    assert resp.status_code == 200
    assert target.role == Role.USER
    assert AuthEventType.SUPERUSER_GATE_PASSED in harness.event_types


@pytest.mark.asyncio
@pytest.mark.parametrize(("path", "body"), _ACTIONS)
async def test_normal_target_needs_no_step_up(path, body) -> None:
    target = _FakeUser(is_superuser=False)
    harness = _build(_FakeUser(is_superuser=True))

    resp = await _patch_user(harness, target, path, body)

    assert resp.status_code == 200
    assert harness.guard.spent_codes == []
    assert harness.event_types == []


@pytest.mark.asyncio
async def test_non_superuser_admin_can_act_on_normal_user() -> None:
    target = _FakeUser(is_superuser=False)
    harness = _build(_FakeUser(is_superuser=False))

    resp = await _patch_user(harness, target, "deactivate", None)

    assert resp.status_code == 200
    assert target.is_active is False


@pytest.mark.asyncio
@pytest.mark.parametrize(("path", "body"), _ACTIONS)
async def test_non_superuser_admin_is_refused_for_superuser_target(path, body) -> None:
    target = _FakeUser(is_superuser=True)
    harness = _build(_FakeUser(is_superuser=False))

    resp = await _patch_user(harness, target, path, body, TOTP_HEADERS)

    assert resp.status_code == 403
    assert target.is_active is True
    assert target.role == Role.ADMIN


@pytest.mark.asyncio
async def test_non_admin_caller_is_refused_on_normal_target() -> None:
    async def not_an_admin() -> _FakeUser:
        raise HTTPException(status_code=403, detail="Admin only")

    target = _FakeUser(is_superuser=False)
    harness = _build(_FakeUser(is_superuser=False), admin_check=not_an_admin)

    resp = await _patch_user(harness, target, "deactivate", None)

    assert resp.status_code == 403
    assert target.is_active is True


@pytest.mark.asyncio
async def test_missing_target_is_404() -> None:
    harness = _build(_FakeUser(is_superuser=True))

    resp = await _patch_user(harness, None, "deactivate", None)

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_plain_gate_still_enforces_step_up_on_toggle_superuser() -> None:
    target = _FakeUser(is_superuser=False)
    harness = _build(_FakeUser(is_superuser=True))

    resp = await _patch_user(harness, target, "superuser", None)

    assert resp.status_code == 401
    assert resp.headers["X-Require-Step-Up"] == "totp"
    assert target.is_superuser is False
