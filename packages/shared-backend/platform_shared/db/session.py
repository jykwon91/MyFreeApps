"""Async SQLAlchemy session factory.

Usage:
    engine, AsyncSessionLocal, get_db, uow = create_session_factory("postgresql+asyncpg://...")
"""
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
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
    get_db: object  # AsyncIterator[AsyncSession] dependency
    unit_of_work: object  # async context manager


def create_session_factory(
    database_url: str,
    *,
    echo: bool = False,
    pool_size: int = 10,
    max_overflow: int = 20,
    pool_timeout: int = 30,
    pool_recycle: int = 1800,
) -> SessionFactory:
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
        async with session_maker() as session:
            async with session.begin():
                yield session

    return SessionFactory(
        engine=engine,
        session_maker=session_maker,
        get_db=get_db,
        unit_of_work=unit_of_work,
    )
