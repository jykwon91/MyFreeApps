"""Async SQLAlchemy session factory.

Per-app db/session.py modules call create_session_factory(...) once at import
time and re-export the four members (engine, session_maker, get_db,
unit_of_work) as module-level names so existing `from app.db.session import X`
imports continue to work.

Usage:
    from platform_shared.db.session import create_session_factory

    _factory = create_session_factory(settings.database_url)
    engine = _factory.engine
    AsyncSessionLocal = _factory.session_maker
    get_db = _factory.get_db
    unit_of_work = _factory.unit_of_work
"""
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import NamedTuple

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


class SessionFactory(NamedTuple):
    engine: AsyncEngine
    session_maker: async_sessionmaker[AsyncSession]
    get_db: Callable[[], AsyncIterator[AsyncSession]]
    unit_of_work: Callable[[], AbstractAsyncContextManager[AsyncSession]]


def create_session_factory(
    database_url: str,
    *,
    echo: bool = False,
    pool_size: int = 5,
    max_overflow: int = 10,
    pool_timeout: int = 10,
    pool_recycle: int = 1800,
    pool_pre_ping: bool = True,
) -> SessionFactory:
    # Pool sizing is bounded by Postgres `max_connections` (default 100),
    # shared across every engine that targets the same database. Each uvicorn
    # worker process AND each background-worker container opens its own engine,
    # so the per-app total is `engines * (pool_size + max_overflow)`. With the
    # canonical app's 4 engines (2 api workers + upload-processor + scheduler)
    # and 5+10, that's 60 < 100 — comfortable headroom. The previous 10+20
    # could demand 120 and exhaust Postgres under load, hanging every request
    # for `pool_timeout` seconds. `pool_timeout=10` makes backpressure fail
    # fast instead of piling up; `pool_pre_ping` transparently replaces a
    # stale connection (e.g. after a Postgres restart) instead of erroring the
    # first request that draws it.
    #
    # SQLite (used in unit tests) doesn't support pool sizing — its async driver
    # pairs with StaticPool, and passing pool_size/max_overflow/pool_timeout
    # raises TypeError at engine creation. Skip pool kwargs for SQLite URLs.
    if database_url.startswith("sqlite"):
        engine = create_async_engine(database_url, echo=echo)
    else:
        engine = create_async_engine(
            database_url,
            echo=echo,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=pool_timeout,
            pool_recycle=pool_recycle,
            pool_pre_ping=pool_pre_ping,
        )
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async def get_db() -> AsyncIterator[AsyncSession]:
        async with session_maker() as session:
            yield session

    @asynccontextmanager
    async def unit_of_work() -> AsyncIterator[AsyncSession]:
        """Transactional scope: commits on clean exit, rolls back on exception."""
        async with session_maker() as session:
            async with session.begin():
                yield session

    return SessionFactory(
        engine=engine,
        session_maker=session_maker,
        get_db=get_db,
        unit_of_work=unit_of_work,
    )
