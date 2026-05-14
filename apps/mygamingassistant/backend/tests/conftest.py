"""Test fixtures for MyGamingAssistant backend.

Single-user app — no registration endpoint. Tests create the seed user
directly via the DB, then log in via /auth/jwt/login.

Mirrors apps/myjobhunter/backend/tests/conftest.py for all shared patterns.
"""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from collections.abc import AsyncGenerator, Callable
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def _disable_external_auth_gates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hibp_enabled", False)
    monkeypatch.setattr(settings, "turnstile_secret_key", "")


@pytest.fixture(autouse=True)
def _reset_login_limiter():
    """Reset the per-IP login limiter buckets before every test."""
    from app.core.rate_limit import login_limiter
    login_limiter._buckets.clear()
    yield
    login_limiter._buckets.clear()


@pytest_asyncio.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Per-test session wrapped in an outer transaction + nested SAVEPOINT.

    Several MGA services (ingestion_orchestrator, source_service) call
    ``await db.commit()`` to make per-chapter inserts durable across a
    sync batch. A naive begin()/rollback() conftest would have those
    commits punch through the test transaction, leaking state into the
    next test (manifest: ``UniqueViolationError: ix_game_slug``).

    The SAVEPOINT-joining pattern (per SQLAlchemy docs "Joining a Session
    into an external transaction") keeps the outer transaction open on the
    underlying connection and translates inner ``session.commit()`` calls
    into SAVEPOINT releases. An ``after_transaction_end`` listener
    reopens a fresh SAVEPOINT so subsequent commits inside the same test
    work too. The outer connection rollback at teardown discards
    everything regardless of how many commits ran inside.
    """
    async with db_engine.connect() as connection:
        outer_trans = await connection.begin()

        # Bind a session to this specific connection so service-level
        # commits land on the same transaction we control.
        session_factory = async_sessionmaker(
            bind=connection, expire_on_commit=False
        )
        async with session_factory() as session:
            await session.begin_nested()

            @event.listens_for(session.sync_session, "after_transaction_end")
            def _restart_savepoint(sess, trans):
                # When the SAVEPOINT ends (via session.commit() / rollback),
                # open a fresh one so the test can keep using `db` without
                # the outer transaction closing.
                if trans.nested and not trans._parent.nested:
                    sess.begin_nested()

            try:
                yield session
            finally:
                await outer_trans.rollback()


@pytest_asyncio.fixture(scope="function")
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
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
