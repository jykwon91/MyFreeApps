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
# Reset module-level limiter state between tests
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
async def user_factory(client: AsyncClient) -> AsyncGenerator[Callable, None]:
    """Factory fixture: call to register a user, auto-cleaned up after test."""
    created_emails: list[str] = []

    async def _create(
        email: str | None = None,
        password: str = "TestPassword123!",
    ) -> dict[str, Any]:
        email = email or f"test-{uuid.uuid4().hex[:8]}@example.com"
        resp = await client.post(
            "/auth/register",
            json={"email": email, "password": password},
        )
        assert resp.status_code == 201, f"Registration failed: {resp.text}"
        created_emails.append(email)
        return {**resp.json(), "password": password, "email": email}

    yield _create

    # Hard-delete so rows don't persist across test sessions.
    # We use a fresh engine/session outside the rolled-back transaction.
    # auth_events.user_id has no FK to users.id (so events survive account
    # deletion in production); for tests we explicitly purge them along
    # with the user row to keep the test DB clean. Anonymous LOGIN_FAILURE
    # events (user_id IS NULL) are also cleared since they're produced by
    # tests in this fixture's scope.
    cleanup_engine = create_async_engine(settings.database_url, poolclass=NullPool)
    cleanup_factory = async_sessionmaker(cleanup_engine, expire_on_commit=False)
    async with cleanup_factory() as sess:
        async with sess.begin():
            for email in created_emails:
                user_row = await sess.execute(
                    text("SELECT id FROM users WHERE email = :email"),
                    {"email": email},
                )
                user_id = user_row.scalar_one_or_none()
                if user_id is not None:
                    await sess.execute(
                        text("DELETE FROM auth_events WHERE user_id = :uid"),
                        {"uid": user_id},
                    )
                await sess.execute(
                    text("DELETE FROM users WHERE email = :email"),
                    {"email": email},
                )
            # Clear any anonymous-failure rows (user_id IS NULL) — these
            # accumulate from /auth/totp/login bad-credentials tests.
            await sess.execute(
                text("DELETE FROM auth_events WHERE user_id IS NULL"),
            )
    await cleanup_engine.dispose()


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
        # First get the token via the API
        token_resp = await AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ).post(
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
