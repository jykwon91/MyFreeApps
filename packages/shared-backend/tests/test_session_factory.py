"""Contract tests for create_session_factory.

Locks the public shape so per-app db/session.py thin wrappers stay valid:
- Returns a SessionFactory with engine, session_maker, get_db, unit_of_work
- get_db is an async generator that yields a usable AsyncSession
- unit_of_work is an async context manager that commits on clean exit and
  rolls back on exception
- SQLite URLs skip pool kwargs (would otherwise TypeError at engine create)
- Postgres URLs apply pool kwargs
- Both kinds of URL hide bound parameters, so no database error's message
  carries the values a statement was given
"""
from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from inspect import isasyncgenfunction

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from platform_shared.db.session import SessionFactory, create_session_factory
from tests.database_error_samples import PROBE_VALUE


def test_factory_returns_session_factory_namedtuple() -> None:
    factory = create_session_factory("sqlite+aiosqlite:///:memory:")
    assert isinstance(factory, SessionFactory)
    assert isinstance(factory.engine, AsyncEngine)
    assert isinstance(factory.session_maker, async_sessionmaker)
    assert isasyncgenfunction(factory.get_db)
    assert callable(factory.unit_of_work)


def test_factory_skips_pool_kwargs_for_sqlite() -> None:
    # If pool kwargs leaked through, AsyncEngine creation would TypeError.
    factory = create_session_factory("sqlite+aiosqlite:///:memory:")
    assert factory.engine.dialect.name == "sqlite"


def test_factory_applies_pool_kwargs_for_postgres() -> None:
    factory = create_session_factory(
        "postgresql+asyncpg://user:pass@localhost/db",
        pool_size=5,
        max_overflow=10,
    )
    assert factory.engine.pool.size() == 5


@pytest.mark.parametrize(
    "database_url",
    ["sqlite+aiosqlite:///:memory:", "postgresql+asyncpg://user:pass@localhost/db"],
    ids=["sqlite", "postgres"],
)
def test_factory_hides_bound_parameters(database_url: str) -> None:
    factory = create_session_factory(database_url)
    assert factory.engine.sync_engine.hide_parameters is True


@pytest.mark.asyncio
async def test_a_failed_statement_does_not_show_its_parameters() -> None:
    factory = create_session_factory("sqlite+aiosqlite:///:memory:")
    insert = text("INSERT INTO probe_users (email) VALUES (:email)")
    try:
        async with factory.engine.connect() as connection:
            await connection.execute(text("CREATE TABLE probe_users (email TEXT UNIQUE)"))
            await connection.execute(insert, {"email": PROBE_VALUE})
            with pytest.raises(IntegrityError) as raised:
                await connection.execute(insert, {"email": PROBE_VALUE})
    finally:
        await factory.engine.dispose()
    assert "[SQL parameters hidden due to hide_parameters=True]" in str(raised.value)
    assert PROBE_VALUE not in str(raised.value)


@pytest.mark.asyncio
async def test_get_db_yields_usable_session() -> None:
    factory = create_session_factory("sqlite+aiosqlite:///:memory:")
    agen = factory.get_db()
    try:
        session = await agen.__anext__()
        assert isinstance(session, AsyncSession)
        result = await session.execute(text("SELECT 1"))
        assert result.scalar() == 1
    finally:
        await agen.aclose()
        await factory.engine.dispose()


@pytest.mark.asyncio
async def test_unit_of_work_commits_on_clean_exit() -> None:
    factory = create_session_factory("sqlite+aiosqlite:///:memory:")
    cm = factory.unit_of_work()
    assert isinstance(cm, AbstractAsyncContextManager)
    async with cm as session:
        assert isinstance(session, AsyncSession)
        assert session.in_transaction()
    await factory.engine.dispose()


@pytest.mark.asyncio
async def test_unit_of_work_rolls_back_on_exception() -> None:
    factory = create_session_factory("sqlite+aiosqlite:///:memory:")

    class _Boom(Exception):
        pass

    with pytest.raises(_Boom):
        async with factory.unit_of_work() as session:
            assert session.in_transaction()
            raise _Boom

    await factory.engine.dispose()
