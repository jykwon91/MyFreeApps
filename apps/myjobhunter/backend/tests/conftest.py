"""Test fixtures for MyJobHunter backend.

Tenant isolation strategy:
- Each test function registers fresh users via the API.
- Users are hard-deleted in cleanup so no test artifacts remain in the DB.
- Use `as_user(user)` fixture factory to get an httpx client bearing that
  user's JWT bearer token.
"""
import asyncio
import sys
import uuid

# On Windows, asyncpg is incompatible with the default ProactorEventLoop
# policy when connections are reused across event loops (the situation that
# arises when ``totp_service.unit_of_work`` opens a new session inside a
# test). The SelectorEventLoop policy avoids this. Linux/macOS already use
# SelectorEventLoop by default — this is a Windows-only adjustment.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
from collections.abc import AsyncGenerator, Callable
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.main import app


# ---------------------------------------------------------------------------
# Fast password hashing for tests.
#
# fastapi-users' default PasswordHelper uses pwdlib's argon2 with recommended
# (production-grade) parameters — ~250ms per hash. Tests like
# ``test_account_lockout`` simulate 5+ failed login attempts each, and
# user_factory creates a fresh user per test. Across the whole suite this
# adds up to many minutes of pure cryptographic work, which is what blew
# past the 20-min CI timeout.
#
# Override the password_helper on BaseUserManager (where MJH's UserManager
# inherits it) with a plaintext-comparison stub. SAFE because:
#   - It only applies inside the test process (this conftest)
#   - Production code is unchanged
#   - Test users are short-lived and never have real passwords
#
# Tests that specifically exercise hashing semantics (none today, but if
# added) should explicitly monkeypatch back to the real PasswordHelper.
# ---------------------------------------------------------------------------

import hashlib

import fastapi_users.password as _fa_password
from fastapi_users.manager import BaseUserManager


class _FastPasswordHelper:
    """Test-only password helper — SHA-256 with no salt, fast.

    NEVER use in production. Only deployed in conftest for the test session.
    """

    def hash(self, password: str) -> str:
        return "sha256:" + hashlib.sha256(password.encode()).hexdigest()

    def verify_and_update(
        self, plain_password: str, hashed_password: str,
    ) -> tuple[bool, str | None]:
        expected = "sha256:" + hashlib.sha256(plain_password.encode()).hexdigest()
        return (expected == hashed_password, None)

    def generate(self) -> str:
        return uuid.uuid4().hex


# fastapi-users' BaseUserManager.__init__ does:
#   self.password_helper = password_helper if password_helper is not None else PasswordHelper()
# so a class-level override gets shadowed on every instance. Replace the
# default-constructor symbol so every fresh PasswordHelper() returns our
# fast stub instead.
_fa_password.PasswordHelper = _FastPasswordHelper  # type: ignore[misc,assignment]
BaseUserManager.password_helper = _FastPasswordHelper()  # type: ignore[assignment]


# Override BaseUserManager.__init__ so newly-constructed managers always use
# the fast helper, regardless of whether they pass password_helper=None.
_orig_init = BaseUserManager.__init__


def _fast_init(self, *args, **kwargs):  # type: ignore[no-untyped-def]
    _orig_init(self, *args, **kwargs)
    self.password_helper = _FastPasswordHelper()


BaseUserManager.__init__ = _fast_init  # type: ignore[method-assign]


# ---------------------------------------------------------------------------
# Default-disable HIBP + Turnstile for the whole test session.
#
# Tests that explicitly want HIBP enabled (test_hibp_validation.py) override
# this with ``monkeypatch.setattr(settings, "hibp_enabled", True)`` or by
# patching the module-level symbol directly. The same goes for Turnstile —
# test_turnstile.py monkeypatches ``settings.turnstile_secret_key`` per test.
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _disable_external_auth_gates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hibp_enabled", False)
    monkeypatch.setattr(settings, "turnstile_secret_key", "")


# ---------------------------------------------------------------------------
# Reset module-level limiter state between tests (PR C3)
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_login_limiter():
    """Reset the per-IP login limiter buckets before every test.

    The ``app.core.rate_limit.login_limiter`` instance holds bucket state
    in a module-level dict; without this fixture the buckets accumulate
    across tests and a single test session exhausts the 10/5min budget,
    causing unrelated tests' login calls to receive 429.
    """
    from app.core.rate_limit import login_limiter
    login_limiter._buckets.clear()
    yield
    login_limiter._buckets.clear()


# ---------------------------------------------------------------------------
# Shared async engine (session-scoped, NullPool so no connection reuse)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="session")
async def db_engine():
    """Session-scoped async engine.

    Shared across all tests so connections created via ``unit_of_work`` (in
    services) bind to the same event loop pytest-asyncio uses for the whole
    run. See ``pytest.ini`` — both ``asyncio_default_fixture_loop_scope``
    and ``asyncio_default_test_loop_scope`` are set to ``session`` for the
    same reason.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    yield engine
    await engine.dispose()


# ---------------------------------------------------------------------------
# Per-test DB session (rolls back after each test)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def db(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Async session wrapped in a transaction rolled back after the test."""
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        # Begin a transaction; all writes inside the test are rolled back.
        await session.begin()
        yield session
        await session.rollback()


# ---------------------------------------------------------------------------
# Unauthenticated httpx test client (wires the test DB session)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Return an httpx async client pointed at the FastAPI app.

    Overrides get_db so all requests share the rolled-back test transaction.
    """
    from app.db.session import get_db as _get_db

    async def _override_get_db():
        yield db

    app.dependency_overrides[_get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# User factory — creates users and hard-deletes them on teardown
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def user_factory(
    client: AsyncClient, db: AsyncSession,
) -> AsyncGenerator[Callable, None]:
    """Factory fixture: call to register a user, auto-cleaned up after test.

    Registers via the public /auth/register endpoint, then forces
    is_verified=True directly on the same rolled-back transaction so
    tests can call /auth/jwt/login without going through the verification
    flow. Pass `verified=False` to keep the user unverified (used by the
    email-verification tests themselves).
    """
    created_emails: list[str] = []

    async def _create(
        email: str | None = None,
        password: str = "TestPassword123!",
        verified: bool = True,
    ) -> dict[str, Any]:
        email = email or f"test-{uuid.uuid4().hex[:8]}@example.com"
        resp = await client.post(
            "/auth/register",
            json={"email": email, "password": password},
        )
        assert resp.status_code == 201, f"Registration failed: {resp.text}"
        created_emails.append(email)
        if verified:
            await db.execute(
                text("UPDATE users SET is_verified = TRUE WHERE email = :email"),
                {"email": email},
            )
        return {
            **resp.json(),
            "password": password,
            "email": email,
            "is_verified": verified,
        }

    yield _create

    # ----- TEMPORARY DIAGNOSTIC PRINTS -----
    # The teardown has been hanging silently in CI. Print before each
    # await so the last line printed reveals exactly which step blocks.
    import sys as _sys
    def _bp(msg):
        print(f"[user_factory.teardown] {msg}", flush=True, file=_sys.stderr)

    _bp("entering teardown")
    cleanup_engine = create_async_engine(settings.database_url, poolclass=NullPool)
    _bp("created cleanup_engine")
    cleanup_factory = async_sessionmaker(cleanup_engine, expire_on_commit=False)
    _bp(f"about to open cleanup session; created_emails={created_emails!r}")
    async with cleanup_factory() as sess:
        _bp("opened cleanup session")
        async with sess.begin():
            _bp("began cleanup transaction")
            for email in created_emails:
                _bp(f"SELECT user id for {email}")
                user_row = await sess.execute(
                    text("SELECT id FROM users WHERE email = :email"),
                    {"email": email},
                )
                user_id = user_row.scalar_one_or_none()
                _bp(f"user_id={user_id}")
                if user_id is not None:
                    _bp(f"DELETE auth_events for uid={user_id}")
                    await sess.execute(
                        text("DELETE FROM auth_events WHERE user_id = :uid"),
                        {"uid": user_id},
                    )
                _bp(f"DELETE user {email}")
                await sess.execute(
                    text("DELETE FROM users WHERE email = :email"),
                    {"email": email},
                )
            _bp("DELETE anonymous auth_events")
            await sess.execute(
                text("DELETE FROM auth_events WHERE user_id IS NULL"),
            )
            _bp("done deletes")
        _bp("committed cleanup transaction")
    _bp("closed cleanup session")
    await cleanup_engine.dispose()
    _bp("disposed cleanup_engine -- teardown complete")


# ---------------------------------------------------------------------------
# Authenticated client factory
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def as_user(db: AsyncSession) -> Callable:
    """Return a factory that yields an authenticated AsyncClient for a user.

    Usage in tests:
        user = await user_factory()
        async with (await as_user(user)) as authed:
            resp = await authed.get("/api/profile")
    """
    from app.db.session import get_db as _get_db

    async def _override_get_db():
        yield db

    async def _make_client(user: dict[str, Any]) -> AsyncClient:
        # Use ``async with`` so the login client's ASGITransport closes its
        # response generator task before we exit. Earlier this was an
        # unmanaged ``AsyncClient(...).post(...)`` whose orphaned tasks
        # lingered in the event loop until pytest-asyncio's fixture
        # finalizer waited them out — a per-test ~60s teardown hang on
        # every test that called ``as_user``.
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as login_client:
            token_resp = await login_client.post(
                "/auth/jwt/login",
                data={"username": user["email"], "password": user["password"]},
            )
        assert token_resp.status_code == 200, f"Login failed: {token_resp.text}"
        token = token_resp.json()["access_token"]

        app.dependency_overrides[_get_db] = _override_get_db
        return AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {token}"},
        )

    return _make_client
