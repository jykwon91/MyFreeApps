import uuid
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import event, JSON, String
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.user.user import User


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


def _patch_metadata_for_sqlite() -> None:
    """Make PostgreSQL-specific DDL compatible with SQLite for tests."""
    for table in Base.metadata.tables.values():
        cols_to_drop: list[str] = []
        for column in table.columns:
            if isinstance(column.type, JSONB):
                column.type = JSON()
            if isinstance(column.type, INET):
                # SQLite has no INET; round-trip as text. Production schema
                # is the source of truth (PostgreSQL INET).
                column.type = String(45)
            if isinstance(column.type, ARRAY):
                # SQLite has no ARRAY; serialize as JSON for tests. The
                # repository layer reads / writes Python lists either way.
                column.type = JSON()
            if column.computed is not None:
                cols_to_drop.append(column.name)
        for name in cols_to_drop:
            table.columns[name].computed = None
            table.columns[name].nullable = True


@pytest_asyncio.fixture()
async def db() -> AsyncGenerator[AsyncSession, None]:
    """In-memory SQLite async session for tests."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")

    @event.listens_for(engine.sync_engine, "connect")
    def _set_fk(dbapi_conn, _rec):  # type: ignore[no-untyped-def]
        dbapi_conn.execute("PRAGMA foreign_keys=OFF")

    _patch_metadata_for_sqlite()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session

    await engine.dispose()


@pytest.fixture()
async def test_user(db: AsyncSession) -> User:
    """Create and return a test user."""
    user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture()
async def test_org(db: AsyncSession, test_user: User) -> Organization:
    """Create a personal organization for the test user."""
    org = Organization(
        id=uuid.uuid4(),
        name=f"{test_user.email}'s Workspace",
        created_by=test_user.id,
    )
    db.add(org)
    await db.flush()
    member = OrganizationMember(
        organization_id=org.id,
        user_id=test_user.id,
        org_role="owner",
    )
    db.add(member)
    await db.commit()
    await db.refresh(org)
    return org
