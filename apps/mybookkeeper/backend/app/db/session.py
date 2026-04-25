from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session


@asynccontextmanager
async def unit_of_work() -> AsyncIterator[AsyncSession]:
    """Provide a transactional scope around a series of operations.

    Commits on successful exit, rolls back on exception.
    Use in services that need to write to multiple tables atomically.
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            yield session
