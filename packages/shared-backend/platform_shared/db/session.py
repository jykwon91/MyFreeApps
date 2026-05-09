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
    pool_size: int = 10,
    max_overflow: int = 20,
    pool_timeout: int = 30,
    pool_recycle: int = 1800,
) -> SessionFactory:
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
