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
async def client(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> AsyncGenerator[AsyncClient, None]:
    from contextlib import asynccontextmanager

    import app.db.session as _session_mod
    from app.db.session import get_db as _get_db

    async def _override_get_db():
        yield db

    # Services that own their transaction boundary call ``unit_of_work()``
    # directly (canonical MBK pattern — the route is a thin wrapper and does
    # NOT receive a db session). The real factory opens a brand-new session
    # on a different pooled connection, which cannot see rows created by the
    # test's SAVEPOINT-bound ``db`` fixture (manifest: route 404s on a
    # fixture-created row). Bind ``unit_of_work`` to the same test session —
    # the symmetric complement to the ``get_db`` override above — so the
    # SAVEPOINT conftest pattern absorbs service-level commits exactly as
    # documented for the ``get_db`` path.
    #
    # ``from app.db.session import unit_of_work`` binds the callable into
    # each consuming module's namespace at import time, so patching only
    # ``app.db.session`` would miss them. Patch the canonical module AND
    # every consumer that imported the name by reference.
    @asynccontextmanager
    async def _override_unit_of_work():
        yield db

    monkeypatch.setattr(_session_mod, "unit_of_work", _override_unit_of_work)

    import importlib

    _uow_consumers = (
        "app.api.account",
        "app.services.game.fixture_loader",
        "app.services.game.lineup_package_service",
        "app.services.game.source_service",
        "app.services.user.seed_user_service",
        "app.services.user.totp_service",
    )
    for _mod_name in _uow_consumers:
        _mod = importlib.import_module(_mod_name)
        if hasattr(_mod, "unit_of_work"):
            monkeypatch.setattr(_mod, "unit_of_work", _override_unit_of_work)

    app.dependency_overrides[_get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
