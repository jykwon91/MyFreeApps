"""Test fixtures for MyPizzaTracker backend.

Single-user app — no registration endpoint. Tests create the seed user
directly via the DB, then log in via /auth/jwt/login.

Mirrors apps/myjobhunter/backend/tests/conftest.py for all shared patterns.
"""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio

from platform_shared.testing.factories import install_fast_password_helper

# Swap argon2 for the fast test hasher before any app module is imported: a
# module that binds ``fastapi_users.password.PasswordHelper`` earlier keeps the
# real argon2 class, and its hashes can never be verified by login.
install_fast_password_helper()

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app import models as _registered_models  # noqa: F401 — every table, for the teardown delete
from app.core.config import settings
from app.db.base import Base
from app.main import app


@pytest.fixture(autouse=True)
def _disable_external_auth_gates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hibp_enabled", False)
    monkeypatch.setattr(settings, "turnstile_secret_key", "")


@pytest.fixture(autouse=True)
def _reset_login_limiter():
    """Reset the in-memory rate-limiter buckets before/after every test.

    The limiters are module-level singletons, so without this a test that
    places several orders (or does several lookups) would leak attempts into
    the next test and trip a spurious 429.
    """
    from app.core.rate_limit import (
        login_limiter,
        public_lookup_limiter,
        public_order_limiter,
    )
    for limiter in (login_limiter, public_order_limiter, public_lookup_limiter):
        limiter._buckets.clear()
    yield
    for limiter in (login_limiter, public_order_limiter, public_lookup_limiter):
        limiter._buckets.clear()


@pytest_asyncio.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """A session on the test database, emptied when the test ends.

    Mirrors MyBookkeeper's and MyJobHunter's ``db`` fixture. Routes write
    through ``unit_of_work`` and must commit to keep anything, so this
    session is not wrapped in a transaction the app could lean on: seed data
    has to be committed, and every table is emptied afterwards.
    """
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    session = session_factory()
    try:
        yield session
    finally:
        await session.close()
        async with db_engine.begin() as conn:
            for table in reversed(Base.metadata.sorted_tables):
                await conn.execute(table.delete())


@pytest_asyncio.fixture(scope="function")
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """An httpx client on the app, using the app's own session factory.

    ``get_db`` is deliberately NOT overridden with the test session. Sharing
    one session between requests and the test made writes that were never
    committed look saved, which hid the fact that no route committed at all.
    Each request now gets its own session exactly as in production, so a
    write is only visible to the test once it has really been committed.
    Depends on ``db`` so the tables are emptied after the client is done.
    """
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
