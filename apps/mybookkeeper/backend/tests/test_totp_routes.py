"""Tests for TOTP API endpoints (app/api/totp.py).

Uses FastAPI AsyncClient with dependency overrides for auth.
The /auth/totp/login endpoint is tested by mocking UserManager.authenticate_password
since we do not have a live database with hashed passwords in the test environment.
"""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pyotp
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.main import app
from app.models.user.user import User
from app.services.user import totp_service


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_user(
    *,
    totp_enabled: bool = False,
    totp_secret: str | None = None,
    totp_recovery_codes: str | None = None,
    email: str = "api-user@example.com",
) -> User:
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=email,
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=totp_enabled,
        totp_secret=totp_secret,
        totp_recovery_codes=totp_recovery_codes,
    )
    return user


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    """Redirect unit_of_work, AsyncSessionLocal, and get_db to the test DB."""
    @asynccontextmanager
    async def _fake_session():
        yield db

    async def _fake_get_db():
        yield db

    app.dependency_overrides[get_db] = _fake_get_db

    with (
        patch("app.services.user.totp_service.unit_of_work", _fake_session),
        patch("app.services.user.totp_service.AsyncSessionLocal", _fake_session),
    ):
        yield

    app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture()
async def user_no_totp(db: AsyncSession) -> User:
    """A user with 2FA not set up."""
    user = _make_user(totp_enabled=False)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def user_with_totp(db: AsyncSession) -> tuple[User, str]:
    """A user with 2FA fully enabled. Returns (user, plaintext_secret)."""
    user_id = uuid.uuid4()
    secret = pyotp.random_base32()
    encrypted_secret = totp_service._encrypt(secret, user_id)
    recovery = totp_service.generate_recovery_codes()
    encrypted_recovery = totp_service._encrypt(",".join(recovery), user_id)
    user = User(
        id=user_id,
        email="totp-user@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=True,
        totp_secret=encrypted_secret,
        totp_recovery_codes=encrypted_recovery,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user, secret


def _auth_client_for(user: User):
    """Return a context manager that yields an AsyncClient with auth overridden to user."""
    import contextlib

    @contextlib.asynccontextmanager
    async def _cm():
        app.dependency_overrides[current_active_user] = lambda: user
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
        app.dependency_overrides.clear()

    return _cm


# ---------------------------------------------------------------------------
# GET /auth/totp/status
# ---------------------------------------------------------------------------

class TestTotpStatus:
    @pytest.mark.asyncio
    async def test_returns_disabled_when_no_totp(self, db: AsyncSession, user_no_totp: User) -> None:
        async with _auth_client_for(user_no_totp)() as client:
            resp = await client.get("/auth/totp/status")
        assert resp.status_code == 200
        assert resp.json() == {"enabled": False}

    @pytest.mark.asyncio
    async def test_returns_enabled_when_totp_active(
        self, db: AsyncSession, user_with_totp: tuple[User, str]
    ) -> None:
        user, _ = user_with_totp
        async with _auth_client_for(user)() as client:
            resp = await client.get("/auth/totp/status")
        assert resp.status_code == 200
        assert resp.json() == {"enabled": True}


# ---------------------------------------------------------------------------
# POST /auth/totp/setup
# ---------------------------------------------------------------------------

class TestTotpSetup:
    @pytest.mark.asyncio
    async def test_returns_secret_and_uri(self, db: AsyncSession, user_no_totp: User) -> None:
        async with _auth_client_for(user_no_totp)() as client:
            resp = await client.post("/auth/totp/setup")
        assert resp.status_code == 200
        data = resp.json()
        assert "secret" in data
        assert "provisioning_uri" in data
        assert data["provisioning_uri"].startswith("otpauth://totp/")

    @pytest.mark.asyncio
    async def test_returns_400_when_already_enabled(
        self, db: AsyncSession, user_with_totp: tuple[User, str]
    ) -> None:
        user, _ = user_with_totp
        async with _auth_client_for(user)() as client:
            resp = await client.post("/auth/totp/setup")
        assert resp.status_code == 400
        assert "already enabled" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# POST /auth/totp/verify
# ---------------------------------------------------------------------------

class TestTotpVerify:
    @pytest.mark.asyncio
    async def test_valid_code_returns_verified_true_with_recovery_codes(
        self, db: AsyncSession, user_no_totp: User
    ) -> None:
        # Setup: give the user an encrypted secret without enabling 2FA
        secret = pyotp.random_base32()
        user_no_totp.totp_secret = totp_service._encrypt(secret, user_no_totp.id)
        await db.commit()

        code = pyotp.TOTP(secret).now()
        async with _auth_client_for(user_no_totp)() as client:
            resp = await client.post("/auth/totp/verify", json={"code": code})
        assert resp.status_code == 200
        data = resp.json()
        assert data["verified"] is True
        assert len(data["recovery_codes"]) == 8

    @pytest.mark.asyncio
    async def test_wrong_code_returns_400(
        self, db: AsyncSession, user_no_totp: User
    ) -> None:
        secret = pyotp.random_base32()
        user_no_totp.totp_secret = totp_service._encrypt(secret, user_no_totp.id)
        await db.commit()

        async with _auth_client_for(user_no_totp)() as client:
            resp = await client.post("/auth/totp/verify", json={"code": "000000"})
        assert resp.status_code == 400
        assert "Invalid" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_non_six_digit_code_rejected_by_schema(
        self, db: AsyncSession, user_no_totp: User
    ) -> None:
        async with _auth_client_for(user_no_totp)() as client:
            resp = await client.post("/auth/totp/verify", json={"code": "12345"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/totp/disable
# ---------------------------------------------------------------------------

class TestTotpDisable:
    @pytest.mark.asyncio
    async def test_valid_code_disables_totp(
        self, db: AsyncSession, user_with_totp: tuple[User, str]
    ) -> None:
        user, secret = user_with_totp
        code = pyotp.TOTP(secret).now()
        async with _auth_client_for(user)() as client:
            resp = await client.post("/auth/totp/disable", json={"code": code})
        assert resp.status_code == 200
        assert resp.json() == {"disabled": True}

    @pytest.mark.asyncio
    async def test_wrong_code_returns_400(
        self, db: AsyncSession, user_with_totp: tuple[User, str]
    ) -> None:
        user, _ = user_with_totp
        async with _auth_client_for(user)() as client:
            resp = await client.post("/auth/totp/disable", json={"code": "000000"})
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_not_enabled_returns_400(
        self, db: AsyncSession, user_no_totp: User
    ) -> None:
        async with _auth_client_for(user_no_totp)() as client:
            resp = await client.post("/auth/totp/disable", json={"code": "123456"})
        assert resp.status_code == 400
        assert "not enabled" in resp.json()["detail"] or "Invalid" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_non_six_digit_code_rejected_by_schema(
        self, db: AsyncSession, user_with_totp: tuple[User, str]
    ) -> None:
        user, _ = user_with_totp
        async with _auth_client_for(user)() as client:
            resp = await client.post("/auth/totp/disable", json={"code": "12345"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/totp/login
# ---------------------------------------------------------------------------

class TestTotpLogin:
    """Login endpoint: email + password + optional TOTP code."""

    @pytest.mark.asyncio
    async def test_bad_credentials_returns_400(self, db: AsyncSession) -> None:
        from app.core.rate_limit import check_login_rate_limit, check_totp_rate_limit

        app.dependency_overrides[check_login_rate_limit] = lambda: None
        app.dependency_overrides[check_totp_rate_limit] = lambda: None
        try:
            with patch(
                "app.api.totp.UserManager.authenticate_password",
                new_callable=AsyncMock,
                return_value=None,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.post(
                        "/auth/totp/login",
                        json={"email": "nobody@example.com", "password": "wrong"},
                    )
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 400
        assert resp.json()["detail"] == "LOGIN_BAD_CREDENTIALS"

    @pytest.mark.asyncio
    async def test_login_without_totp_returns_token(
        self, db: AsyncSession, user_no_totp: User
    ) -> None:
        from app.core.rate_limit import check_login_rate_limit, check_totp_rate_limit
        app.dependency_overrides[check_login_rate_limit] = lambda: None
        app.dependency_overrides[check_totp_rate_limit] = lambda: None
        try:
            with patch(
                "app.api.totp.UserManager.authenticate_password",
                new_callable=AsyncMock,
                return_value=user_no_totp,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.post(
                        "/auth/totp/login",
                        json={"email": user_no_totp.email, "password": "correct"},
                    )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_with_totp_enabled_but_no_code_returns_totp_required(
        self, db: AsyncSession, user_with_totp: tuple[User, str]
    ) -> None:
        user, _ = user_with_totp
        from app.core.rate_limit import check_login_rate_limit, check_totp_rate_limit
        app.dependency_overrides[check_login_rate_limit] = lambda: None
        app.dependency_overrides[check_totp_rate_limit] = lambda: None
        try:
            with patch(
                "app.api.totp.UserManager.authenticate_password",
                new_callable=AsyncMock,
                return_value=user,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.post(
                        "/auth/totp/login",
                        json={"email": user.email, "password": "correct"},
                    )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200
        assert resp.json() == {"detail": "totp_required"}

    @pytest.mark.asyncio
    async def test_login_with_valid_totp_code_returns_token(
        self, db: AsyncSession, user_with_totp: tuple[User, str]
    ) -> None:
        user, secret = user_with_totp
        code = pyotp.TOTP(secret).now()
        from app.core.rate_limit import check_login_rate_limit, check_totp_rate_limit
        app.dependency_overrides[check_login_rate_limit] = lambda: None
        app.dependency_overrides[check_totp_rate_limit] = lambda: None
        try:
            with patch(
                "app.api.totp.UserManager.authenticate_password",
                new_callable=AsyncMock,
                return_value=user,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.post(
                        "/auth/totp/login",
                        json={"email": user.email, "password": "correct", "totp_code": code},
                    )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_with_invalid_totp_code_returns_401(
        self, db: AsyncSession, user_with_totp: tuple[User, str]
    ) -> None:
        user, _ = user_with_totp
        from app.core.rate_limit import check_login_rate_limit, check_totp_rate_limit
        app.dependency_overrides[check_login_rate_limit] = lambda: None
        app.dependency_overrides[check_totp_rate_limit] = lambda: None
        try:
            with patch(
                "app.api.totp.UserManager.authenticate_password",
                new_callable=AsyncMock,
                return_value=user,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.post(
                        "/auth/totp/login",
                        json={"email": user.email, "password": "correct", "totp_code": "000000"},
                    )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 401
        assert "Invalid" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_login_with_valid_recovery_code_returns_token(
        self, db: AsyncSession, user_with_totp: tuple[User, str]
    ) -> None:
        user, _ = user_with_totp
        recovery_str = totp_service._decrypt(user.totp_recovery_codes, user.id)
        recovery_code = recovery_str.split(",")[0]
        from app.core.rate_limit import check_login_rate_limit, check_totp_rate_limit
        app.dependency_overrides[check_login_rate_limit] = lambda: None
        app.dependency_overrides[check_totp_rate_limit] = lambda: None
        try:
            with patch(
                "app.api.totp.UserManager.authenticate_password",
                new_callable=AsyncMock,
                return_value=user,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.post(
                        "/auth/totp/login",
                        json={"email": user.email, "password": "correct", "totp_code": recovery_code},
                    )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    @pytest.mark.asyncio
    async def test_login_recovery_code_consumed_on_second_use_returns_401(
        self, db: AsyncSession, user_with_totp: tuple[User, str]
    ) -> None:
        user, _ = user_with_totp
        recovery_str = totp_service._decrypt(user.totp_recovery_codes, user.id)
        recovery_code = recovery_str.split(",")[0]
        from app.core.rate_limit import check_login_rate_limit, check_totp_rate_limit
        app.dependency_overrides[check_login_rate_limit] = lambda: None
        app.dependency_overrides[check_totp_rate_limit] = lambda: None
        try:
            with patch(
                "app.api.totp.UserManager.authenticate_password",
                new_callable=AsyncMock,
                return_value=user,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    await client.post(
                        "/auth/totp/login",
                        json={"email": user.email, "password": "correct", "totp_code": recovery_code},
                    )
                    resp2 = await client.post(
                        "/auth/totp/login",
                        json={"email": user.email, "password": "correct", "totp_code": recovery_code},
                    )
        finally:
            app.dependency_overrides.clear()
        assert resp2.status_code == 401


# ---------------------------------------------------------------------------
# Rate limit on /auth/totp/login
# ---------------------------------------------------------------------------

class TestTotpLoginRateLimit:
    @pytest.mark.asyncio
    async def test_rate_limit_blocks_after_threshold(self, db: AsyncSession) -> None:
        """The TOTP limiter allows 5 attempts per 300s; the 6th must return 429."""
        from app.core.rate_limit import RateLimiter
        from app.core.rate_limit import check_login_rate_limit
        from app.db.session import get_db

        # Use a fresh limiter with max=2 so the test runs fast
        limiter = RateLimiter(max_attempts=2, window_seconds=60)
        call_count = 0

        async def _limited_check():
            nonlocal call_count
            call_count += 1
            limiter.check("test-ip")

        app.dependency_overrides[check_login_rate_limit] = _limited_check
        app.dependency_overrides[get_db] = lambda: db
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                for _ in range(2):
                    await client.post(
                        "/auth/totp/login",
                        json={"email": "x@example.com", "password": "pw"},
                    )
                resp = await client.post(
                    "/auth/totp/login",
                    json={"email": "x@example.com", "password": "pw"},
                )
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 429
