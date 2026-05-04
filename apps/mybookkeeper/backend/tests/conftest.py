import os
import uuid
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Disable python-magic's libmagic DLL on Windows — it crashes the test
# interpreter with an access violation when the native libmagic DLL isn't
# installed.  The header-bytes fallback in report_processor.py covers the
# same allowlisted MIME types (PDF, JPEG, PNG) and is the path exercised by
# the report-processor unit tests.  Setting this at conftest import time
# ensures the guard fires before any test module is collected.
os.environ.setdefault("MAGIC_DISABLED", "1")

# Environment tag — set to "test" so init_sentry() does not require SENTRY_DSN.
# Must be set before settings is imported.
os.environ.setdefault("ENVIRONMENT", "test")

# Storage env vars — set before settings is imported so ``get_storage()``
# doesn't raise StorageNotConfiguredError when the lifespan or any
# service touches it. The ``_patch_storage_for_tests`` autouse fixture
# replaces the cached client with a MagicMock so no real network call
# is ever attempted.
os.environ.setdefault("MINIO_ENDPOINT", "test-minio:9000")
os.environ.setdefault("MINIO_ACCESS_KEY", "test-access-key")
os.environ.setdefault("MINIO_SECRET_KEY", "test-secret-key")
os.environ.setdefault("MINIO_BUCKET", "test-bucket")
os.environ.setdefault("MINIO_PUBLIC_ENDPOINT", "test-minio:9000")
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


@pytest.fixture(autouse=True)
def _patch_storage_for_tests(monkeypatch):
    """Replace the cached storage client with an in-memory MagicMock so
    every importer of ``get_storage`` sees a working storage without
    actually touching the network.

    Storage is now a hard requirement (the FastAPI lifespan refuses to
    boot on misconfig). Tests don't have a real MinIO, so we (a) ensure
    env vars are set above so the get_storage missing-vars check passes,
    then (b) inject a fake into ``_client`` so the function returns it
    without ever constructing a real Minio() client. Tests that want to
    assert misconfig behavior override by patching ``get_storage`` on
    the importing module directly.
    """
    fake = MagicMock()
    fake.bucket = "test-bucket"
    fake.generate_presigned_url.side_effect = lambda key, ttl: f"https://signed/{key}"
    fake.ensure_bucket.return_value = None
    # ``generate_key`` is the storage key generator used by upload paths;
    # returning a MagicMock from it would fail downstream INSERTs that
    # bind the value as a string column.
    fake.generate_key.side_effect = lambda org_id, filename: f"{org_id}/test/{filename}"
    fake.upload_file.side_effect = lambda key, content, content_type: key

    from app.core import storage
    monkeypatch.setattr(storage, "_client", fake)


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
