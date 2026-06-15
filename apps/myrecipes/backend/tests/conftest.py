"""Test fixtures for MyRecipes backend.

Multi-user app — tenant isolation strategy mirrors MyJobHunter:
- Each test registers fresh users via the API (``user_factory``).
- Users are hard-deleted on teardown, cascade-removing every recipe row they
  own (FK ``ON DELETE CASCADE`` on ``user_id``) so no artifacts persist.
- Use ``as_user(user)`` to get an httpx client bearing that user's JWT.

Mirrors apps/myjobhunter/backend/tests/conftest.py (minus MJH-specific
discovery / scheduler / embedding fixtures).
"""
import asyncio
import sys

# Windows: asyncpg is incompatible with the default ProactorEventLoop when a
# connection is reused across event loops (e.g. when a service opens a new
# session via unit_of_work inside a test). SelectorEventLoop avoids this.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from collections.abc import AsyncGenerator, Callable
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.main import app

# Importing this installs the fast-password-helper monkeypatch at import time
# (replaces argon2 ~250ms/hash with SHA-256 for test speed). See
# platform_shared.testing.factories for the rationale + safety notes.
from platform_shared.testing.factories import make_api_user_factory


@pytest.fixture(autouse=True)
def _disable_external_auth_gates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hibp_enabled", False)
    monkeypatch.setattr(settings, "turnstile_secret_key", "")


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """Clear per-IP limiter buckets before + after every test.

    The limiters hold bucket state in module-level dicts; without this the
    buckets accumulate across the session and exhaust the budget, causing
    unrelated tests' login/register calls to receive 429.
    """
    from app.core.rate_limit import login_limiter, register_limiter, totp_limiter

    for limiter in (login_limiter, register_limiter, totp_limiter):
        limiter._buckets.clear()
    yield
    for limiter in (login_limiter, register_limiter, totp_limiter):
        limiter._buckets.clear()


@pytest_asyncio.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Async session wrapped in a transaction rolled back after the test."""
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        await session.begin()
        yield session
        await session.rollback()


@pytest_asyncio.fixture(scope="function")
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Unauthenticated client; overrides get_db so requests share the test txn."""
    from app.db.session import get_db as _get_db

    async def _override_get_db():
        yield db

    app.dependency_overrides[_get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# User factory — registers users via /auth/register and hard-deletes them on
# teardown. Shared implementation lives in platform_shared.testing.factories.
from app.db.session import get_db as _myrecipes_get_db  # noqa: E402

user_factory = make_api_user_factory(
    app=app,
    database_url_getter=lambda: settings.database_url,
    get_db_dep=_myrecipes_get_db,
)


@pytest_asyncio.fixture(scope="function")
async def as_user(db: AsyncSession) -> Callable:
    """Return a factory that yields an authenticated AsyncClient for a user.

    Usage:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/recipes")
    """
    from app.db.session import get_db as _get_db

    async def _override_get_db():
        yield db

    async def _make_client(user: dict[str, Any]) -> AsyncClient:
        token_resp = await AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test",
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
