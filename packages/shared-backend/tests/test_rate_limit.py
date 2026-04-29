"""Unit tests for ``platform_shared.core.rate_limit``.

These tests cover the pure / app-agnostic surface promoted in PR M6:

  * ``RateLimiter`` token-bucket math, time-window expiry, generic 429
    body
  * ``email_domain_from_request`` PII-safe parsing
  * ``make_require_turnstile`` factory
  * ``make_check_login_ip_limit`` factory — including the
    ``LOGIN_BLOCKED_RATE_LIMIT`` audit event written on block
  * ``make_check_account_not_locked`` factory

App-level integration (the bound dependencies under MBK's
``app.core.rate_limit`` namespace, FastAPI router wiring, and the
fastapi-users glue) stays in MBK — those tests need MBK's User model,
auth backend, and audit listener.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException, Request
from fastapi.datastructures import Headers
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from platform_shared.core.rate_limit import (
    RateLimiter,
    email_domain_from_request,
    make_check_account_not_locked,
    make_check_login_ip_limit,
    make_require_turnstile,
)
from platform_shared.db.models.auth_event import AuthEvent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_request(
    *,
    ip: str = "1.2.3.4",
    headers: dict[str, str] | None = None,
    login_email: str | None = None,
) -> MagicMock:
    """Build a minimal MagicMock that satisfies the bits of ``Request`` we
    introspect (``headers``, ``client.host``, ``state.login_email``).

    Uses a real :class:`fastapi.datastructures.Headers` so case-insensitive
    lookups (``X-Turnstile-Token`` vs ``x-turnstile-token``) behave like
    a real request.
    """
    request = MagicMock(spec=Request)
    request.headers = Headers({"user-agent": "TestAgent/1.0", **(headers or {})})
    request.client = MagicMock()
    request.client.host = ip
    request.state = MagicMock(spec=[])
    if login_email is not None:
        request.state.login_email = login_email
    return request


def _make_credentials(email: str, password: str = "anything") -> OAuth2PasswordRequestForm:
    form = MagicMock(spec=OAuth2PasswordRequestForm)
    form.username = email
    form.password = password
    return form


async def _events(db: AsyncSession) -> list[AuthEvent]:
    return list((await db.execute(select(AuthEvent))).scalars().all())


# ---------------------------------------------------------------------------
# RateLimiter — pure token-bucket math
# ---------------------------------------------------------------------------

class TestRateLimiter:
    def test_allows_up_to_max(self) -> None:
        limiter = RateLimiter(max_attempts=3, window_seconds=60)
        for _ in range(3):
            limiter.check("ip1")

    def test_blocks_after_max(self) -> None:
        limiter = RateLimiter(max_attempts=3, window_seconds=60)
        for _ in range(3):
            limiter.check("ip1")
        with pytest.raises(HTTPException) as exc_info:
            limiter.check("ip1")
        assert exc_info.value.status_code == 429
        assert exc_info.value.detail == RATE_LIMIT_GENERIC_DETAIL

    def test_independent_keys(self) -> None:
        limiter = RateLimiter(max_attempts=2, window_seconds=60)
        limiter.check("ip1")
        limiter.check("ip1")
        # ip2 should still be allowed
        limiter.check("ip2")

    def test_single_attempt_limit(self) -> None:
        limiter = RateLimiter(max_attempts=1, window_seconds=60)
        limiter.check("ip1")
        with pytest.raises(HTTPException) as exc_info:
            limiter.check("ip1")
        assert exc_info.value.status_code == 429

    def test_zero_window_expires_immediately(self) -> None:
        """With ``window_seconds=0`` every entry is stale by the next check."""
        limiter = RateLimiter(max_attempts=1, window_seconds=0)
        limiter.check("ip1")
        # Next call succeeds because the window already passed.
        limiter.check("ip1")

    def test_blocked_response_uses_generic_detail(self) -> None:
        """The 429 body must be the shared generic string — no info leak.

        If this string ever diverges across gates, an attacker can probe
        which gate fired and therefore whether their target account is
        currently locked.
        """
        limiter = RateLimiter(max_attempts=1, window_seconds=60)
        limiter.check("ip1")
        with pytest.raises(HTTPException) as exc_info:
            limiter.check("ip1")
        assert exc_info.value.detail == RATE_LIMIT_GENERIC_DETAIL


# ---------------------------------------------------------------------------
# email_domain_from_request — PII-safe parsing
# ---------------------------------------------------------------------------

class TestEmailDomainFromRequest:
    def test_returns_none_when_state_has_no_login_email(self) -> None:
        request = _make_request()
        assert email_domain_from_request(request) is None

    def test_returns_none_for_non_string_login_email(self) -> None:
        request = _make_request()
        request.state.login_email = 12345  # not a string
        assert email_domain_from_request(request) is None

    def test_returns_none_when_no_at_sign(self) -> None:
        request = _make_request(login_email="not-an-email")
        assert email_domain_from_request(request) is None

    def test_returns_lowercased_domain(self) -> None:
        request = _make_request(login_email="User@Example.COM")
        assert email_domain_from_request(request) == "example.com"

    def test_never_returns_full_email(self) -> None:
        """Helper must NEVER leak the local part — only the domain."""
        request = _make_request(login_email="alice.smith@bigcorp.test")
        domain = email_domain_from_request(request)
        assert domain == "bigcorp.test"
        assert "alice" not in (domain or "")


# ---------------------------------------------------------------------------
# make_require_turnstile factory
# ---------------------------------------------------------------------------

class TestMakeRequireTurnstile:
    @pytest.mark.anyio
    async def test_dev_mode_passes_without_token(self) -> None:
        """Empty secret_key (dev / CI) skips the check entirely."""
        verify = AsyncMock(return_value=True)
        dep = make_require_turnstile(lambda: "", verify=verify)

        request = _make_request()
        await dep(request)  # must not raise
        verify.assert_not_awaited()

    @pytest.mark.anyio
    async def test_missing_token_header_raises_400(self) -> None:
        verify = AsyncMock(return_value=True)
        dep = make_require_turnstile(lambda: "secret", verify=verify)

        request = _make_request()
        with pytest.raises(HTTPException) as exc_info:
            await dep(request)
        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "Captcha token required"
        verify.assert_not_awaited()

    @pytest.mark.anyio
    async def test_invalid_token_raises_400(self) -> None:
        verify = AsyncMock(return_value=False)
        dep = make_require_turnstile(lambda: "secret", verify=verify)

        request = _make_request(headers={"x-turnstile-token": "bad"})
        with pytest.raises(HTTPException) as exc_info:
            await dep(request)
        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "Captcha verification failed"

    @pytest.mark.anyio
    async def test_valid_token_passes(self) -> None:
        verify = AsyncMock(return_value=True)
        dep = make_require_turnstile(lambda: "secret", verify=verify)

        request = _make_request(headers={"x-turnstile-token": "good"})
        await dep(request)  # must not raise
        verify.assert_awaited_once_with(
            "good", "1.2.3.4", secret_key="secret",
        )

    @pytest.mark.anyio
    async def test_secret_key_provider_is_called_per_request(self) -> None:
        """The provider is read on every request so callers can dynamically
        toggle Turnstile (e.g. tests that ``patch.object(settings, …)``)."""
        provider_calls = 0

        def _provider() -> str:
            nonlocal provider_calls
            provider_calls += 1
            return ""  # stays in dev mode

        verify = AsyncMock(return_value=True)
        dep = make_require_turnstile(_provider, verify=verify)

        request = _make_request()
        await dep(request)
        await dep(request)
        await dep(request)

        assert provider_calls == 3

    @pytest.mark.anyio
    async def test_uses_x_forwarded_for_as_remote_ip(self) -> None:
        """Reverse-proxy deployments rely on ``X-Forwarded-For`` for the
        real caller IP — that's what gets sent to Cloudflare."""
        verify = AsyncMock(return_value=True)
        dep = make_require_turnstile(lambda: "secret", verify=verify)

        request = _make_request(
            headers={
                "x-turnstile-token": "good",
                "x-forwarded-for": "203.0.113.5, 10.0.0.1",
            },
        )
        await dep(request)
        verify.assert_awaited_once_with(
            "good", "203.0.113.5", secret_key="secret",
        )


# ---------------------------------------------------------------------------
# make_check_login_ip_limit factory
# ---------------------------------------------------------------------------

class TestMakeCheckLoginIpLimit:
    @pytest.mark.anyio
    async def test_under_limit_does_not_block_or_log(self, db: AsyncSession) -> None:
        log_event = AsyncMock()
        limiter = RateLimiter(max_attempts=5, window_seconds=60)
        dep = make_check_login_ip_limit(limiter, log_event=log_event)

        request = _make_request(ip="1.2.3.4")
        await dep(request, db)

        log_event.assert_not_awaited()
        assert (await _events(db)) == []

    @pytest.mark.anyio
    async def test_over_limit_raises_429_with_generic_detail(self, db: AsyncSession) -> None:
        log_event = AsyncMock()
        limiter = RateLimiter(max_attempts=1, window_seconds=60)
        dep = make_check_login_ip_limit(limiter, log_event=log_event)

        request = _make_request(ip="9.9.9.9")
        await dep(request, db)  # seeds the bucket

        with pytest.raises(HTTPException) as exc_info:
            await dep(request, db)
        assert exc_info.value.status_code == 429
        assert exc_info.value.detail == RATE_LIMIT_GENERIC_DETAIL

    @pytest.mark.anyio
    async def test_block_writes_audit_event_with_ip_metadata(self, db: AsyncSession) -> None:
        """Using the real ``log_auth_event`` (default seam) — verifies the
        full row shape, including the ``LOGIN_BLOCKED_RATE_LIMIT`` event
        type, ``user_id=None``, and ``ip`` in metadata.
        """
        limiter = RateLimiter(max_attempts=1, window_seconds=60)
        dep = make_check_login_ip_limit(limiter)

        request = _make_request(ip="203.0.113.42")
        await dep(request, db)  # seed
        with pytest.raises(HTTPException):
            await dep(request, db)  # block → writes event + commits

        rows = await _events(db)
        rate_limit_rows = [
            r for r in rows
            if r.event_type == AuthEventType.LOGIN_BLOCKED_RATE_LIMIT
        ]
        assert len(rate_limit_rows) == 1
        ev = rate_limit_rows[0]
        assert ev.user_id is None
        assert ev.succeeded is False
        assert ev.ip_address == "203.0.113.42"
        assert ev.event_metadata.get("ip") == "203.0.113.42"
        # Anonymous block — no email_domain unless caller stashed one.
        assert "email_domain" not in ev.event_metadata
        # Full email must NEVER reach the audit row (PII guard).
        assert "email" not in ev.event_metadata
        assert "password" not in ev.event_metadata

    @pytest.mark.anyio
    async def test_block_includes_email_domain_when_stashed(self, db: AsyncSession) -> None:
        limiter = RateLimiter(max_attempts=1, window_seconds=60)
        dep = make_check_login_ip_limit(limiter)

        request = _make_request(ip="198.51.100.7", login_email="user@example.com")
        await dep(request, db)  # seed
        with pytest.raises(HTTPException):
            await dep(request, db)

        rows = await _events(db)
        ev = next(r for r in rows if r.event_type == AuthEventType.LOGIN_BLOCKED_RATE_LIMIT)
        assert ev.event_metadata.get("email_domain") == "example.com"
        assert ev.event_metadata.get("ip") == "198.51.100.7"


# ---------------------------------------------------------------------------
# make_check_account_not_locked factory
# ---------------------------------------------------------------------------

class _FakeUser:
    """Minimal ``UserLike`` — only ``locked_until`` is read."""

    def __init__(self, locked_until: datetime | None) -> None:
        self.id = uuid.uuid4()
        self.locked_until = locked_until


class TestMakeCheckAccountNotLocked:
    @pytest.mark.anyio
    async def test_locked_account_raises_429(self) -> None:
        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
        locked_user = _FakeUser(locked_until=future)
        lookup = AsyncMock(return_value=locked_user)
        dep = make_check_account_not_locked(lookup)

        with pytest.raises(HTTPException) as exc_info:
            await dep(_make_credentials("user@example.com"), MagicMock())
        assert exc_info.value.status_code == 429
        assert exc_info.value.detail == RATE_LIMIT_GENERIC_DETAIL

    @pytest.mark.anyio
    async def test_unlocked_account_does_not_raise(self) -> None:
        unlocked = _FakeUser(locked_until=None)
        lookup = AsyncMock(return_value=unlocked)
        dep = make_check_account_not_locked(lookup)

        await dep(_make_credentials("user@example.com"), MagicMock())  # must not raise

    @pytest.mark.anyio
    async def test_unknown_email_does_not_raise(self) -> None:
        """Unknown email must not raise — leaves it to the auth flow so
        the response is timing-safe with the 'wrong password' branch."""
        lookup = AsyncMock(return_value=None)
        dep = make_check_account_not_locked(lookup)

        await dep(_make_credentials("ghost@example.com"), MagicMock())  # must not raise

    @pytest.mark.anyio
    async def test_expired_lock_does_not_raise(self) -> None:
        past = datetime.now(tz=timezone.utc) - timedelta(seconds=1)
        user = _FakeUser(locked_until=past)
        lookup = AsyncMock(return_value=user)
        dep = make_check_account_not_locked(lookup)

        await dep(_make_credentials("user@example.com"), MagicMock())  # must not raise

    @pytest.mark.anyio
    async def test_user_lookup_called_with_session_and_username(self) -> None:
        unlocked = _FakeUser(locked_until=None)
        lookup = AsyncMock(return_value=unlocked)
        dep = make_check_account_not_locked(lookup)

        fake_db = MagicMock()
        await dep(_make_credentials("user@example.com"), fake_db)

        lookup.assert_awaited_once_with(fake_db, "user@example.com")


# ---------------------------------------------------------------------------
# Regression guard — shared module never imports any app code
# ---------------------------------------------------------------------------

class TestSharedModuleHasNoAppImports:
    def test_rate_limit_module_does_not_import_app(self) -> None:
        """``platform_shared.core.rate_limit`` must stay app-agnostic.

        If a future change re-introduces ``from app.core.config import
        settings`` (or any other ``app.*`` import) the shared package
        will only work inside MyBookkeeper — every other consumer
        breaks at import time. This regression guard fails loudly.
        """
        import platform_shared.core.rate_limit as mod

        source: str = ""
        if mod.__file__:
            with open(mod.__file__, encoding="utf-8") as fh:
                source = fh.read()

        offending = [
            line for line in source.splitlines()
            if line.strip().startswith(("from app.", "import app."))
        ]
        assert offending == [], (
            "platform_shared.core.rate_limit must not import from `app.*`; "
            f"found: {offending}"
        )
