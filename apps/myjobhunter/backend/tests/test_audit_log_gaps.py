"""Tests for the 2026-05-02 audit-log gap + PII cleanup fixes in MJH.

Three contracts pinned here:

2. Logger statements in UserManager no longer emit full user.email —
   only user.id (Fix 2, CWE-532 / PII).

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
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.db.models.auth_event import AuthEvent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_request(ip: str = "1.2.3.4") -> MagicMock:
    request = MagicMock()
    request.headers = {"user-agent": "TestAgent/1.0"}
    request.client = MagicMock()
    request.client.host = ip
    request.state = MagicMock(spec=[])
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
# Fix 2 — Logger statements do not emit full user.email
# ---------------------------------------------------------------------------


class TestNoEmailInLockedAccountLogs:
    @pytest.mark.asyncio
    async def test_locked_account_log_does_not_contain_email(self) -> None:
        """logger.info in UserManager.authenticate for the locked-account
        path must not include the full email address — only user.id."""
        import logging
        from app.core.auth import UserManager
        from app.core.config import settings

        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)

        user = MagicMock()
        user.id = uuid.uuid4()
        user.email = "secret@private.com"
        user.failed_login_count = settings.lockout_threshold
        user.locked_until = future
        user.last_failed_login_at = None
        user.is_verified = True
        user.is_active = True

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

        for msg in captured_messages:
            assert "@" not in msg, (
                f"Log message leaked full email address: {msg!r}\n"
                "Fix 2 requires user.id in place of user.email in logger calls."
            )

    @pytest.mark.asyncio
    async def test_totp_authenticate_password_locked_log_does_not_contain_email(
        self,
    ) -> None:
        """The 'TOTP login rejected for locked account' log in authenticate_password
        must use user.id, not user.email."""
        import logging
        from app.core.auth import UserManager
        from app.core.config import settings

        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)

        user = MagicMock()
        user.id = uuid.uuid4()
        user.email = "topsecret@private.com"
        user.failed_login_count = settings.lockout_threshold
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
        creds.username = "topsecret@private.com"
        creds.password = "whatever"
        request = _make_request()

        try:
            with patch(
                "app.core.auth.emit_locked_login_event",
                new_callable=AsyncMock,
            ):
                await manager.authenticate_password(creds, request)
        finally:
            test_logger.removeHandler(handler)

        for msg in captured_messages:
            assert "@" not in msg, (
                f"Log message in authenticate_password leaked email: {msg!r}"
            )


# ---------------------------------------------------------------------------
# Fix 3 — authenticate_password threads request to emit_locked_login_event
# ---------------------------------------------------------------------------


class TestLockedLoginEventCapturesRequestContext:
    @pytest.mark.asyncio
    async def test_authenticate_password_threads_request_to_locked_event(
        self,
    ) -> None:
        """authenticate_password must pass request to emit_locked_login_event
        so the audit row has non-null ip_address / user_agent."""
        from app.core.auth import UserManager
        from app.core.config import settings

        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
        user = MagicMock()
        user.id = uuid.uuid4()
        user.email = "locked@example.com"
        user.failed_login_count = settings.lockout_threshold
        user.locked_until = future
        user.last_failed_login_at = None

        manager = UserManager.__new__(UserManager)
        manager.get_by_email = AsyncMock(return_value=user)
        manager.user_db = MagicMock()
        manager.user_db.update = AsyncMock()
        manager.user_db.session = MagicMock()
        manager.password_helper = MagicMock()

        captured_requests: list = []

        async def _capture_emit(*, db, user_id=None, request=None, log_event=None, **kwargs):
            captured_requests.append(request)

        request = _make_request(ip="172.16.0.1")
        creds = MagicMock()
        creds.username = "locked@example.com"
        creds.password = "anything"

        with patch("app.core.auth.emit_locked_login_event", new=_capture_emit):
            await manager.authenticate_password(creds, request)

        assert len(captured_requests) == 1
        assert captured_requests[0] is request, (
            "authenticate_password must forward request to emit_locked_login_event"
        )

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
        from app.api.totp import totp_login
        from app.schemas.totp import TotpLoginRequest

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

        with pytest.raises(HTTPException) as exc_info:
            await totp_login(
                request=request,
                body=body,
                user_manager=user_manager,
                db=db,
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
    async def test_none_user_audit_event_has_null_user_id_and_bad_credentials(
        self, db: AsyncSession,
    ) -> None:
        """When authenticate_password returns None, the LOGIN_FAILURE row
        must have user_id=None and reason='bad_credentials'."""
        from app.api.totp import totp_login
        from app.schemas.totp import TotpLoginRequest

        # Use a unique IP to identify rows written by this exact test invocation.
        unique_ip = f"192.168.201.{id(db) % 256}"
        request = _make_request(ip=unique_ip)

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
        this_run_rows = [r for r in rows if r.ip_address == unique_ip]
        bad_creds_rows = [
            r for r in this_run_rows
            if r.event_type == AuthEventType.LOGIN_FAILURE
            and r.event_metadata.get("reason") == "bad_credentials"
        ]
        assert bad_creds_rows, (
            "Expected LOGIN_FAILURE with reason='bad_credentials' for "
            f"ip={unique_ip}"
        )
        ev = bad_creds_rows[0]
        assert ev.user_id is None, "user_id must be None for an unknown user"
