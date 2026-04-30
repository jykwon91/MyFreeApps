"""Test fixtures for MyJobHunter backend.

Tenant isolation strategy:
- Each test function registers fresh users via the API.
- Users are hard-deleted in cleanup so no test artifacts remain in the DB.
- Use `as_user(user)` fixture factory to get an httpx client bearing that
  user's JWT bearer token.
"""
import uuid
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
# Shared async engine (session-scoped, NullPool so no connection reuse)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="session")
async def db_engine():
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
    cleanup_engine = create_async_engine(settings.database_url, poolclass=NullPool)
    cleanup_factory = async_sessionmaker(cleanup_engine, expire_on_commit=False)
    async with cleanup_factory() as sess:
        async with sess.begin():
            for email in created_emails:
                await sess.execute(
                    text("DELETE FROM users WHERE email = :email"),
                    {"email": email},
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
