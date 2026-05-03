"""Tests for the 2026-05-02 audit-log gap + PII cleanup fixes.

Four contracts pinned here:

1. TOTP rate-limit gate (check_totp_rate_limit) emits LOGIN_BLOCKED_RATE_LIMIT
   with metadata.gate="totp" when the bucket is exhausted (Fix 1, CWE-778).

2. Logger statements in UserManager no longer emit the full user.email address
   — only user.id (Fix 2, CWE-532 / PII).

3. emit_locked_login_event accepts an optional request parameter so that
   ip_address and user_agent are captured when called from authenticate_password
   (Fix 3, CWE-778).

4. Inactive-user TOTP login failure logs user_id (not None) with
   reason="account_inactive" instead of collapsing with the bad-credentials
   case (Fix 4, CWE-778).
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType

from app.core.rate_limit import RateLimiter, check_totp_rate_limit
from app.models.system.auth_event import AuthEvent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_request(ip: str = "1.2.3.4") -> MagicMock:
    request = MagicMock()
    request.headers = {"user-agent": "TestAgent/1.0"}
    request.client = MagicMock()
    request.client.host = ip
    request.state = MagicMock(spec=[])  # no login_email attr
    return request


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
# Fix 1 — TOTP rate-limit gate emits audit event on block
# ---------------------------------------------------------------------------


class TestTotpRateLimitEmitsAuditEvent:
    @pytest.mark.anyio
    async def test_totp_gate_block_writes_login_blocked_rate_limit(
        self, db: AsyncSession,
    ) -> None:
        """Exhausting the TOTP per-IP bucket must write a
        LOGIN_BLOCKED_RATE_LIMIT row with metadata.gate='totp'.
        Before Fix 1, the gate silently re-raised 429 without writing
        any audit row."""
        scoped_limiter = RateLimiter(max_attempts=1, window_seconds=60)
        request = _make_request(ip="10.0.0.1")

        with patch("app.core.rate_limit.totp_limiter", scoped_limiter):
            # Seed the bucket — allowed, no row written.
            await check_totp_rate_limit(request=request, db=db)
            assert (await _auth_events(db)) == []

            # Second call exhausts the bucket and must write the audit row.
            with pytest.raises(HTTPException) as exc_info:
                await check_totp_rate_limit(request=request, db=db)

        assert exc_info.value.status_code == 429

        rows = await _auth_events(db)
        blocked = [
            r for r in rows
            if r.event_type == AuthEventType.LOGIN_BLOCKED_RATE_LIMIT
        ]
        assert len(blocked) == 1, (
            f"Expected 1 LOGIN_BLOCKED_RATE_LIMIT row, got {len(blocked)}"
        )
        ev = blocked[0]
        assert ev.succeeded is False
        assert ev.user_id is None
        assert ev.event_metadata.get("gate") == "totp", (
            "metadata.gate must be 'totp' to distinguish TOTP-path blocks "
            "from standard login-path blocks"
        )
        assert ev.event_metadata.get("ip") == "10.0.0.1"

    @pytest.mark.anyio
    async def test_totp_gate_block_body_is_generic(
        self, db: AsyncSession,
    ) -> None:
        """The 429 body from the TOTP gate must be byte-identical to the
        standard login-gate body (RATE_LIMIT_GENERIC_DETAIL) so callers
        cannot infer which gate fired."""
        from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
        from app.core.rate_limit import check_login_rate_limit

        scoped_totp_limiter = RateLimiter(max_attempts=1, window_seconds=60)
        scoped_login_limiter = RateLimiter(max_attempts=1, window_seconds=60)
        request = _make_request(ip="10.0.0.2")

        # Seed both buckets.
        with patch("app.core.rate_limit.totp_limiter", scoped_totp_limiter):
            await check_totp_rate_limit(request=request, db=db)
        with patch("app.core.rate_limit.login_limiter", scoped_login_limiter):
            await check_login_rate_limit(request=request, db=db)

        # Trip both and compare the 429 bodies.
        with patch("app.core.rate_limit.totp_limiter", scoped_totp_limiter):
            with pytest.raises(HTTPException) as totp_exc:
                await check_totp_rate_limit(request=request, db=db)

        with patch("app.core.rate_limit.login_limiter", scoped_login_limiter):
            with pytest.raises(HTTPException) as login_exc:
                await check_login_rate_limit(request=request, db=db)

        assert totp_exc.value.detail == login_exc.value.detail
        assert totp_exc.value.detail == RATE_LIMIT_GENERIC_DETAIL


# ---------------------------------------------------------------------------
# Fix 2 — Logger statements do not emit full user.email
# ---------------------------------------------------------------------------


class TestNoEmailInLockedAccountLogs:
    @pytest.mark.anyio
    async def test_locked_account_log_does_not_contain_email(self) -> None:
        """logger.info in UserManager.authenticate for the locked-account
        path must not include the full email address — only user.id.
        Before Fix 2, the format string included user.email directly."""
        import logging
        from app.core.auth import UserManager

        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)

        user = MagicMock()
        user.id = uuid.uuid4()
        user.email = "secret@private.com"
        user.failed_login_count = 5
        user.locked_until = future
        user.last_failed_login_at = None

        manager = UserManager.__new__(UserManager)
        manager.get_by_email = AsyncMock(return_value=user)
        manager.user_db = MagicMock()
        manager.user_db.update = AsyncMock()
        manager.user_db.session = MagicMock()
        manager.password_helper = MagicMock()

        captured_messages: list[str] = []

        class _Capture(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                captured_messages.append(self.format(record))

        import app.core.auth as auth_module
        handler = _Capture()
        test_logger = logging.getLogger(auth_module.__name__)
        test_logger.addHandler(handler)
        test_logger.setLevel(logging.DEBUG)

        creds = MagicMock()
        creds.username = "secret@private.com"
        creds.password = "whatever"

        try:
            with patch(
                "app.core.auth.emit_locked_login_event",
                new_callable=AsyncMock,
            ):
                await manager.authenticate(creds)
        finally:
            test_logger.removeHandler(handler)

        # Assert no captured log message contains the full email address.
        for msg in captured_messages:
            assert "@" not in msg, (
                f"Log message leaked full email address: {msg!r}\n"
                "Fix 2 requires user.id in place of user.email in logger calls."
            )

    @pytest.mark.anyio
    async def test_account_locked_warning_log_does_not_contain_email(
        self,
    ) -> None:
        """The 'Account locked' warning (emitted when the threshold is reached)
        must also not include user.email."""
        import logging
        from app.core.auth import UserManager
        from app.core.config import settings

        user = MagicMock()
        user.id = uuid.uuid4()
        user.email = "victim@private.com"
        user.failed_login_count = settings.lockout_threshold - 1
        user.locked_until = None
        user.last_failed_login_at = None

        manager = UserManager.__new__(UserManager)
        manager.get_by_email = AsyncMock(return_value=user)
        manager.user_db = MagicMock()
        manager.user_db.update = AsyncMock()
        manager.user_db.session = MagicMock()
        manager.password_helper = MagicMock()
        manager.password_helper.hash = MagicMock(return_value="hashed")

        captured_messages: list[str] = []

        class _Capture(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                captured_messages.append(self.format(record))

        import app.core.auth as auth_module
        handler = _Capture()
        test_logger = logging.getLogger(auth_module.__name__)
        test_logger.addHandler(handler)
        test_logger.setLevel(logging.DEBUG)

        creds = MagicMock()
        creds.username = "victim@private.com"
        creds.password = "wrongpassword"

        try:
            with patch(
                "fastapi_users.BaseUserManager.authenticate",
                new_callable=AsyncMock,
                return_value=None,
            ):
                await manager.authenticate(creds)
        finally:
            test_logger.removeHandler(handler)

        for msg in captured_messages:
            assert "@" not in msg, (
                f"Log message leaked email address: {msg!r}"
            )


# ---------------------------------------------------------------------------
# Fix 3 — emit_locked_login_event captures IP/UA when request is provided
# ---------------------------------------------------------------------------


class TestLockedLoginEventCapturesRequestContext:
    @pytest.mark.anyio
    async def test_emit_locked_login_event_with_request_sets_ip_and_ua(
        self, db: AsyncSession,
    ) -> None:
        """When request is passed to emit_locked_login_event, the resulting
        auth_events row must have non-null ip_address and user_agent.
        Before Fix 3, the function didn't accept request, so both were NULL."""
        from platform_shared.services.account_lockout import emit_locked_login_event

        request = MagicMock()
        request.headers = {"user-agent": "Mozilla/5.0 (Fix3Test)"}
        request.client = MagicMock()
        request.client.host = "192.168.1.100"

        user_id = uuid.uuid4()
        await emit_locked_login_event(db=db, user_id=user_id, request=request)

        rows = await _auth_events(db)
        blocked = [r for r in rows if r.event_type == AuthEventType.LOGIN_BLOCKED_LOCKED]
        assert len(blocked) == 1
        ev = blocked[0]
        assert ev.user_id == user_id
        assert ev.ip_address == "192.168.1.100", (
            "ip_address must be captured from request when request is provided"
        )
        assert ev.user_agent is not None, (
            "user_agent must be captured from request when request is provided"
        )

    @pytest.mark.anyio
    async def test_emit_locked_login_event_without_request_is_backwards_compatible(
        self, db: AsyncSession,
    ) -> None:
        """Calling emit_locked_login_event without request must still work —
        request=None is the default so existing callers don't break."""
        from platform_shared.services.account_lockout import emit_locked_login_event

        user_id = uuid.uuid4()
        await emit_locked_login_event(db=db, user_id=user_id)

        rows = await _auth_events(db)
        blocked = [r for r in rows if r.event_type == AuthEventType.LOGIN_BLOCKED_LOCKED]
        assert len(blocked) == 1
        assert blocked[0].user_id == user_id

    @pytest.mark.anyio
    async def test_authenticate_accepts_request_parameter(self) -> None:
        """emit_locked_login_event now accepts an optional request parameter
        so callers can supply it. Verify the function signature accepts request=...
        without raising TypeError."""
        from platform_shared.services.account_lockout import emit_locked_login_event
        import inspect
        sig = inspect.signature(emit_locked_login_event)
        assert "request" in sig.parameters, (
            "emit_locked_login_event must accept a 'request' keyword argument "
            "so callers on the TOTP login path (which have a Request) can pass "
            "it through for IP/UA capture in the audit row"
        )


# ---------------------------------------------------------------------------
# Fix 4 — Inactive-user TOTP login failure logs user_id + correct reason
# ---------------------------------------------------------------------------


class TestInactiveUserTotpLoginAudit:
    @pytest.mark.anyio
    async def test_inactive_user_audit_event_has_user_id_and_account_inactive(
        self, db: AsyncSession,
    ) -> None:
        """When the TOTP login endpoint receives an inactive user from
        authenticate_password, it must write a LOGIN_FAILURE row with:
          - user_id = the inactive user's UUID (not None)
          - metadata.reason = 'account_inactive'

        Before Fix 4, the collapsed condition wrote user_id=None and
        reason='bad_credentials' for the inactive case."""
        from app.api.totp import totp_login
        from app.schemas.user.totp import TotpLoginRequest

        inactive_user = _make_active_user(is_active=False)
        request = _make_request()

        body = MagicMock(spec=TotpLoginRequest)
        body.email = "inactive@example.com"
        body.password = "pw"
        body.totp_code = None

        user_manager = MagicMock()
        user_manager.authenticate_password = AsyncMock(return_value=inactive_user)

        with pytest.raises(HTTPException) as exc_info:
            await totp_login(
                request=request,
                body=body,
                user_manager=user_manager,
                db=db,
            )

        assert exc_info.value.status_code == 400

        rows = await _auth_events(db)
        inactive_rows = [
            r for r in rows
            if r.event_type == AuthEventType.LOGIN_FAILURE
            and r.event_metadata.get("reason") == "account_inactive"
        ]
        assert inactive_rows, (
            "Expected a LOGIN_FAILURE row with reason='account_inactive'. "
            "All rows: " + str([(r.event_type, r.event_metadata) for r in rows])
        )
        ev = inactive_rows[0]
        assert ev.user_id == inactive_user.id, (
            f"user_id must be {inactive_user.id} (not None) — "
            "the user is known, just inactive"
        )

    @pytest.mark.anyio
    async def test_none_user_audit_event_has_null_user_id_and_bad_credentials(
        self, db: AsyncSession,
    ) -> None:
        """When authenticate_password returns None, the LOGIN_FAILURE row
        must have user_id=None and reason='bad_credentials'.
        This verifies the None branch wasn't broken by the split."""
        from app.api.totp import totp_login
        from app.schemas.user.totp import TotpLoginRequest

        request = _make_request()

        body = MagicMock(spec=TotpLoginRequest)
        body.email = "ghost@example.com"
        body.password = "pw"
        body.totp_code = None

        user_manager = MagicMock()
        user_manager.authenticate_password = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as exc_info:
            await totp_login(
                request=request,
                body=body,
                user_manager=user_manager,
                db=db,
            )

        assert exc_info.value.status_code == 400

        rows = await _auth_events(db)
        bad_creds_rows = [
            r for r in rows
            if r.event_type == AuthEventType.LOGIN_FAILURE
            and r.event_metadata.get("reason") == "bad_credentials"
        ]
        assert bad_creds_rows, "Expected LOGIN_FAILURE with reason='bad_credentials'"
        ev = bad_creds_rows[0]
        assert ev.user_id is None, "user_id must be None for an unknown user"
