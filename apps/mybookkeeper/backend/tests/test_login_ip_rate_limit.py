"""Tests for the per-IP login rate-limit gate (`check_login_rate_limit`).

Three regression contracts are pinned here:

1. The 429 body returned by the per-IP gate is byte-identical to the body
   returned by the account-lockout gate. This denies an attacker the
   ability to infer which gate fired and therefore whether their target
   account is currently locked.

2. Every per-IP block writes a single LOGIN_BLOCKED_RATE_LIMIT row to the
   `auth_events` table so credential-stuffing patterns are visible to
   admin/SOC tooling.

3. POST `/auth/totp/login` is gated by the same audited dependency as
   POST `/auth/jwt/login`, so coverage from (1) and (2) extends to the
   2FA login path.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_events import AuthEventType
from app.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from app.core.rate_limit import (
    RateLimiter,
    check_account_not_locked,
    check_login_rate_limit,
    check_totp_rate_limit,
)
from app.db.session import get_db
from app.main import app
from app.models.system.auth_event import AuthEvent
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _route_db(db: AsyncSession):
    """Point all routes at the in-memory test DB."""
    async def _fake_get_db():
        yield db

    app.dependency_overrides[get_db] = _fake_get_db
    yield
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
    """Build a minimal MagicMock that satisfies Request introspection
    used by `get_client_ip` and `log_auth_event`."""
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
        self, db: AsyncSession,
    ) -> None:
        """Both gates raise an HTTPException with the same status code AND
        the same detail string. FastAPI serializes any HTTPException to
        ``{"detail": <detail>}`` deterministically, so identical
        (status_code, detail) pairs guarantee byte-identical 429 bodies.

        If they diverge again, an attacker can probe whether a given
        username corresponds to a currently-locked account.
        """
        # --- Trigger the per-IP gate by exhausting a tiny scoped limiter.
        scoped_limiter = RateLimiter(max_attempts=1, window_seconds=60)

        request = _make_request(ip="9.9.9.9")
        with patch("app.core.rate_limit.login_limiter", scoped_limiter):
            # First call seeds the bucket; second call trips it.
            await check_login_rate_limit(request=request, db=db)
            with pytest.raises(HTTPException) as ip_exc_info:
                await check_login_rate_limit(request=request, db=db)
        ip_exc = ip_exc_info.value

        # --- Trigger the account-lockout gate against a real locked user.
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
        self, db: AsyncSession,
    ) -> None:
        """Hitting the per-IP gate must produce exactly one
        LOGIN_BLOCKED_RATE_LIMIT row in `auth_events`, with the IP in
        metadata and no full email (PII) anywhere on the row."""
        scoped_limiter = RateLimiter(max_attempts=1, window_seconds=60)
        request = _make_request(ip="203.0.113.42")

        with patch("app.core.rate_limit.login_limiter", scoped_limiter):
            # Seed the bucket — this attempt is allowed and writes nothing.
            await check_login_rate_limit(request=request, db=db)
            assert (await _events(db)) == []

            # Second attempt is blocked AND writes one audit row.
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
        # IP is recorded in metadata so admins can correlate without joining
        # against other tables.
        assert ev.event_metadata.get("ip") == "203.0.113.42"
        # Full email must NEVER be persisted — only the domain (or nothing).
        assert "email" not in ev.event_metadata
        assert "password" not in ev.event_metadata


# ---------------------------------------------------------------------------
# 3) /auth/totp/login uses the same audited gate
# ---------------------------------------------------------------------------

class TestTotpEndpointUsesSameGate:
    @pytest.mark.asyncio
    async def test_totp_login_endpoint_uses_same_gate(
        self, db: AsyncSession,
    ) -> None:
        """POST /auth/totp/login must call ``check_login_rate_limit`` on
        every request — so swapping that dependency for a counting stub
        must record one hit per request.

        The matching coverage for ``/auth/jwt/login`` lives in the route
        registration in ``app.main`` (verified by reading the dependency
        list there); we don't drive that endpoint via TestClient because
        fastapi-users' router pulls in dependencies whose defaults can't
        be deepcopied under newer pydantic — a known upstream limitation
        unrelated to the gate we're verifying.
        """
        hits = 0

        async def _counting_gate() -> None:
            nonlocal hits
            hits += 1

        app.dependency_overrides[check_login_rate_limit] = _counting_gate
        app.dependency_overrides[check_totp_rate_limit] = lambda: None

        with patch(
            "app.api.totp.UserManager.authenticate_password",
            new_callable=AsyncMock,
            return_value=None,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                for _ in range(3):
                    await client.post(
                        "/auth/totp/login",
                        json={"email": "x@example.com", "password": "pw"},
                    )

        assert hits == 3, (
            "Expected /auth/totp/login to invoke check_login_rate_limit on "
            f"every request, but only saw {hits} invocations across 3 calls."
        )

    def test_jwt_login_router_includes_audited_gate(self) -> None:
        """Static check: ``/auth/jwt/login`` must be registered with the
        audited per-IP gate as a route dependency. If someone removes
        ``check_login_rate_limit`` from ``app.main``, this test fails."""
        from app.main import app as main_app

        login_routes = [
            r for r in main_app.routes
            if getattr(r, "path", "") == "/auth/jwt/login"
        ]
        assert login_routes, "Expected /auth/jwt/login route to be registered"

        # The dependency lives on the router include, which propagates onto
        # each route's `dependant.dependencies` list.
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
