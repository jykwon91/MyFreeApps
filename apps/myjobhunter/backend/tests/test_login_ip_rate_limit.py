"""Per-IP login rate-limit gate (MyJobHunter — PR C3).

Three regression contracts:

1. The 429 body returned by the per-IP gate is byte-identical to the body
   returned by the account-lockout gate. Callers cannot infer which gate
   fired and therefore cannot infer whether their target account is
   locked.

2. Every per-IP block writes a single ``LOGIN_BLOCKED_RATE_LIMIT`` row
   to the ``auth_events`` table. Metadata captures ``ip`` and the email
   ``email_domain`` only — never the full email (PII).

3. ``POST /auth/jwt/login`` is registered with the audited per-IP gate
   as a route dependency. If someone removes ``check_login_rate_limit``
   from ``app.main``, this test fails.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL

from app.core.rate_limit import (
    RateLimiter,
    check_account_not_locked,
    check_login_rate_limit,
)
from app.db.session import get_db
from app.main import app
from app.models.system.auth_event import AuthEvent
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def _route_db(db: AsyncSession):
    """Point all routes at the rolled-back test transaction.

    These tests intentionally call ``db.commit()`` (the per-IP gate
    commits its audit row before re-raising the 429), which means rows
    leak across the rolled-back-transaction boundary. We clean the
    ``auth_events`` and ``users`` tables once per test so each test
    starts from a clean slate without contaminating sibling tests.

    Not autouse — only the DB-bound tests in this file pull this in.
    The static-only test (``TestJwtLoginRouterIncludesAuditedGate``)
    must NOT require a DB connection.
    """
    from sqlalchemy import text

    async def _fake_get_db():
        yield db

    app.dependency_overrides[get_db] = _fake_get_db

    await db.execute(text("DELETE FROM auth_events"))
    await db.execute(text("DELETE FROM users"))
    await db.commit()

    yield

    try:
        await db.execute(text("DELETE FROM auth_events"))
        await db.execute(text("DELETE FROM users"))
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()
    app.dependency_overrides.clear()


def _make_locked_user(email: str = "locked@example.com") -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        failed_login_count=5,
        locked_until=datetime.now(tz=timezone.utc) + timedelta(minutes=5),
    )


def _make_request(ip: str = "1.2.3.4") -> MagicMock:
    """Build a Request-like mock for get_client_ip + log_auth_event."""
    request = MagicMock()
    request.headers = {"user-agent": "TestAgent/1.0"}
    request.client = MagicMock()
    request.client.host = ip
    request.state = MagicMock(spec=[])  # no `login_email` attr
    return request


def _make_credentials(email: str, password: str = "anything") -> OAuth2PasswordRequestForm:
    form = MagicMock(spec=OAuth2PasswordRequestForm)
    form.username = email
    form.password = password
    return form


async def _events(db: AsyncSession) -> list[AuthEvent]:
    return list((await db.execute(select(AuthEvent))).scalars().all())


# ---------------------------------------------------------------------------
# 1) Per-IP 429 body == account-lockout 429 body
# ---------------------------------------------------------------------------


class TestResponseBodyIndistinguishability:
    @pytest.mark.asyncio
    async def test_per_ip_429_body_matches_account_lockout_429_body(
        self, db: AsyncSession, _route_db,
    ) -> None:
        """Both gates raise an HTTPException with the same status code AND
        the same detail string. FastAPI serializes any HTTPException to
        ``{"detail": <detail>}`` deterministically, so identical
        (status_code, detail) pairs guarantee byte-identical 429 bodies.
        """
        scoped_limiter = RateLimiter(max_attempts=1, window_seconds=60)
        request = _make_request(ip="9.9.9.9")
        with patch("app.core.rate_limit.login_limiter", scoped_limiter):
            await check_login_rate_limit(request=request, db=db)
            with pytest.raises(HTTPException) as ip_exc_info:
                await check_login_rate_limit(request=request, db=db)
        ip_exc = ip_exc_info.value

        locked_user = _make_locked_user()
        db.add(locked_user)
        await db.commit()

        with pytest.raises(HTTPException) as lock_exc_info:
            await check_account_not_locked(
                credentials=_make_credentials(locked_user.email),
                db=db,
            )
        lock_exc = lock_exc_info.value

        assert ip_exc.status_code == 429
        assert lock_exc.status_code == 429
        assert ip_exc.detail == lock_exc.detail
        assert ip_exc.detail == RATE_LIMIT_GENERIC_DETAIL


# ---------------------------------------------------------------------------
# 2) Per-IP block writes LOGIN_BLOCKED_RATE_LIMIT
# ---------------------------------------------------------------------------


class TestPerIpBlockAuditEvent:
    @pytest.mark.asyncio
    async def test_per_ip_block_writes_audit_event(
        self, db: AsyncSession, _route_db,
    ) -> None:
        """A per-IP block produces exactly one LOGIN_BLOCKED_RATE_LIMIT
        row with the IP in metadata and no full email anywhere."""
        scoped_limiter = RateLimiter(max_attempts=1, window_seconds=60)
        request = _make_request(ip="203.0.113.42")

        with patch("app.core.rate_limit.login_limiter", scoped_limiter):
            await check_login_rate_limit(request=request, db=db)
            assert (await _events(db)) == []

            with pytest.raises(HTTPException) as exc_info:
                await check_login_rate_limit(request=request, db=db)

        assert exc_info.value.status_code == 429
        assert exc_info.value.detail == RATE_LIMIT_GENERIC_DETAIL

        rows = await _events(db)
        rate_limit_rows = [
            r for r in rows
            if r.event_type == AuthEventType.LOGIN_BLOCKED_RATE_LIMIT
        ]
        assert len(rate_limit_rows) == 1
        ev = rate_limit_rows[0]
        assert ev.succeeded is False
        assert ev.user_id is None
        assert ev.ip_address == "203.0.113.42"
        assert ev.event_metadata.get("ip") == "203.0.113.42"
        # Full email must NEVER be persisted — only the domain (or nothing).
        assert "email" not in ev.event_metadata
        assert "password" not in ev.event_metadata

    @pytest.mark.asyncio
    async def test_per_ip_block_records_email_domain_when_available(
        self, db: AsyncSession, _route_db,
    ) -> None:
        """When ``request.state.login_email`` is set by an upstream layer,
        the audit row records ``metadata.email_domain`` (lowercase, no full
        email)."""
        scoped_limiter = RateLimiter(max_attempts=1, window_seconds=60)
        request = _make_request(ip="198.51.100.7")
        request.state = MagicMock(spec=["login_email"])
        request.state.login_email = "Stuffer@Example.COM"

        with patch("app.core.rate_limit.login_limiter", scoped_limiter):
            await check_login_rate_limit(request=request, db=db)
            with pytest.raises(HTTPException):
                await check_login_rate_limit(request=request, db=db)

        rows = await _events(db)
        rate_limit_rows = [
            r for r in rows
            if r.event_type == AuthEventType.LOGIN_BLOCKED_RATE_LIMIT
        ]
        assert len(rate_limit_rows) == 1
        ev = rate_limit_rows[0]
        assert ev.event_metadata.get("email_domain") == "example.com"
        assert "email" not in ev.event_metadata


# ---------------------------------------------------------------------------
# 3) /auth/jwt/login is registered with the audited gate
# ---------------------------------------------------------------------------


class TestJwtLoginRouterIncludesAuditedGate:
    def test_jwt_login_router_includes_audited_gate(self) -> None:
        from app.main import app as main_app

        login_routes = [
            r for r in main_app.routes
            if getattr(r, "path", "") == "/auth/jwt/login"
        ]
        assert login_routes, "Expected /auth/jwt/login route to be registered"

        dependants = []
        for r in login_routes:
            dep = getattr(r, "dependant", None)
            if dep is not None:
                dependants.extend(dep.dependencies)

        gate_calls = [
            d.call for d in dependants if getattr(d, "call", None) is not None
        ]
        assert check_login_rate_limit in gate_calls, (
            "Expected /auth/jwt/login to be gated by "
            "app.core.rate_limit.check_login_rate_limit, but it isn't."
        )
        assert check_account_not_locked in gate_calls, (
            "Expected /auth/jwt/login to be gated by "
            "app.core.rate_limit.check_account_not_locked, but it isn't."
        )
