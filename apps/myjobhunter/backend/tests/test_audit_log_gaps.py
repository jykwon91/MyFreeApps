"""Tests for the 2026-05-02 audit-log gap + PII cleanup fixes in MJH.

Contracts pinned here:

3. emit_locked_login_event accepts optional request so IP/UA are captured
   when called from authenticate_password (Fix 3, CWE-778).

4. Inactive-user TOTP login failure logs user_id (not None) with
   reason='account_inactive' instead of collapsing with bad-credentials
   (Fix 4, CWE-778).

Fix 1 (TOTP rate-limit audit event) is MBK-only — MJH does not yet have
a separate TOTP-specific per-IP rate-limit gate. The shared
check_login_rate_limit already applies on /auth/totp/login in MJH.
"""
import uuid
from collections.abc import Awaitable, Callable
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.db.session import unit_of_work_on_same_database
from platform_shared.schemas.totp.totp_login_request import TotpLoginRequest
from platform_shared.schemas.totp.totp_login_response import TotpLoginResponse
from platform_shared.db.models.auth_event import AuthEvent
from platform_shared.services.account_guard_service import AccountGuardService

from app.api.totp import router as totp_router
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _totp_login_endpoint() -> Callable[..., Awaitable[TotpLoginResponse]]:
    return next(route.endpoint for route in totp_router.routes if route.path == "/auth/totp/login")


def _make_request(ip: str = "1.2.3.4") -> MagicMock:
    request = MagicMock()
    request.headers = {"user-agent": "TestAgent/1.0"}
    request.client = MagicMock()
    request.client.host = ip
    request.state = MagicMock(spec=[])
    return request


def _guard_on(db: AsyncSession) -> AccountGuardService:
    return AccountGuardService(
        user_model=User,
        unit_of_work_factory=lambda: unit_of_work_on_same_database(db),
    )


async def _auth_events(db: AsyncSession) -> list[AuthEvent]:
    return list((await db.execute(select(AuthEvent))).scalars().all())


def _make_active_user(*, is_active: bool = True) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "user@example.com"
    user.is_active = is_active
    user.is_verified = True
    user.totp_enabled = False
    user.failed_login_count = 0
    user.locked_until = None
    user.last_failed_login_at = None
    return user


# ---------------------------------------------------------------------------
# Fix 3 — emit_locked_login_event captures IP/UA when request is provided
# ---------------------------------------------------------------------------


class TestLockedLoginEventCapturesRequestContext:
    @pytest.mark.asyncio
    async def test_emit_locked_login_event_with_request_sets_ip(
        self, db: AsyncSession,
    ) -> None:
        """When request is passed to emit_locked_login_event, the audit row
        must have non-null ip_address."""
        from platform_shared.services.account_lockout import emit_locked_login_event

        request = MagicMock()
        request.headers = {"user-agent": "Fix3/MJH"}
        request.client = MagicMock()
        request.client.host = "10.20.30.40"

        user_id = uuid.uuid4()
        await emit_locked_login_event(db=db, user_id=user_id, request=request)
        # Flush to make rows visible in this session without committing.
        await db.flush()

        rows = await _auth_events(db)
        blocked = [r for r in rows if r.event_type == AuthEventType.LOGIN_BLOCKED_LOCKED]
        assert len(blocked) >= 1
        # The most recent row should have the IP we passed in.
        ip_rows = [r for r in blocked if r.ip_address == "10.20.30.40"]
        assert ip_rows, (
            "Expected a LOGIN_BLOCKED_LOCKED row with ip_address='10.20.30.40'"
        )

    @pytest.mark.asyncio
    async def test_emit_locked_login_event_without_request_still_works(
        self, db: AsyncSession,
    ) -> None:
        """Omitting request is backwards-compatible (default=None)."""
        from platform_shared.services.account_lockout import emit_locked_login_event

        user_id = uuid.uuid4()
        await emit_locked_login_event(db=db, user_id=user_id)
        await db.flush()

        rows = await _auth_events(db)
        blocked = [r for r in rows if r.event_type == AuthEventType.LOGIN_BLOCKED_LOCKED]
        assert any(r.user_id == user_id for r in blocked), (
            "Expected a LOGIN_BLOCKED_LOCKED row with the given user_id"
        )


# ---------------------------------------------------------------------------
# Fix 4 — Inactive-user TOTP login failure logs user_id + reason
# ---------------------------------------------------------------------------


class TestInactiveUserTotpLoginAudit:
    @pytest.mark.asyncio
    async def test_inactive_user_audit_event_has_user_id_and_account_inactive(
        self, db: AsyncSession,
    ) -> None:
        """When the TOTP login endpoint receives an inactive user from
        authenticate_password, it must write a LOGIN_FAILURE row with:
          - user_id = the inactive user's UUID (not None)
          - metadata.reason = 'account_inactive'"""
        totp_login = _totp_login_endpoint()

        inactive_user = _make_active_user(is_active=False)
        # Use a unique IP to identify rows written by this exact test invocation.
        unique_ip = f"192.168.200.{id(inactive_user) % 256}"
        request = _make_request(ip=unique_ip)

        body = MagicMock(spec=TotpLoginRequest)
        body.email = "inactive@example.com"
        body.password = "pw"
        body.totp_code = None

        user_manager = MagicMock()
        user_manager.authenticate_password = AsyncMock(return_value=inactive_user)
        user_manager.account_guard = _guard_on(db)

        with pytest.raises(HTTPException) as exc_info:
            await totp_login(
                request=request,
                body=body,
                user_manager=user_manager,
            )

        assert exc_info.value.status_code == 400

        # Filter to rows written by this specific request (by the unique IP).
        rows = await _auth_events(db)
        this_run_rows = [r for r in rows if r.ip_address == unique_ip]
        inactive_rows = [
            r for r in this_run_rows
            if r.event_type == AuthEventType.LOGIN_FAILURE
            and r.event_metadata.get("reason") == "account_inactive"
        ]
        assert inactive_rows, (
            "Expected a LOGIN_FAILURE row with reason='account_inactive' for "
            f"ip={unique_ip}. This-run rows: "
            + str([(r.event_type, r.event_metadata, r.user_id) for r in this_run_rows])
        )
        ev = inactive_rows[0]
        assert ev.user_id == inactive_user.id, (
            f"user_id must be {inactive_user.id} (not None) — "
            "the user is known, just inactive"
        )

    @pytest.mark.asyncio
    async def test_a_refused_password_adds_no_row_of_its_own(
        self, db: AsyncSession,
    ) -> None:
        """authenticate_password has already recorded the refusal."""
        totp_login = _totp_login_endpoint()
        rows_before = len(await _auth_events(db))

        request = _make_request()

        body = MagicMock(spec=TotpLoginRequest)
        body.email = "ghost@example.com"
        body.password = "pw"
        body.totp_code = None

        user_manager = MagicMock()
        user_manager.authenticate_password = AsyncMock(return_value=None)
        user_manager.account_guard = _guard_on(db)

        with pytest.raises(HTTPException) as exc_info:
            await totp_login(
                request=request,
                body=body,
                user_manager=user_manager,
            )

        assert exc_info.value.status_code == 400
        assert len(await _auth_events(db)) == rows_before
