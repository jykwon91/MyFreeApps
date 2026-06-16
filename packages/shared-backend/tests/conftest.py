"""Shared-backend test config — registers asyncio mode and a fresh in-memory DB."""
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from minio.error import S3Error
from sqlalchemy import JSON, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from platform_shared.db.base import Base


def make_s3_error(code: str, key: str = "obj") -> S3Error:
    """Build a minio ``S3Error`` with a given code for transparency tests.

    ``code="NoSuchKey"`` exercises the missing-object path; any other code
    exercises the transient-outage path that callers re-raise. minio's
    ``S3Error.__init__`` takes ``response`` FIRST, then code/message/...
    """
    return S3Error(None, code, f"{code} for {key}", key, "", "")


class FakeStorageClient:
    """In-memory stand-in for ``platform_shared.core.storage.StorageClient``.

    Backs the transparency store tests without a real MinIO. ``download_file``
    raises a ``NoSuchKey`` ``S3Error`` for absent keys, matching the real
    client's behaviour that ``transparency_store.load_document`` depends on.
    """

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.uploads: list[tuple[str, bytes, str]] = []

    def upload_file(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> str:
        self.objects[key] = bytes(content)
        self.uploads.append((key, bytes(content), content_type))
        return key

    def download_file(self, key: str) -> bytes:
        if key not in self.objects:
            raise make_s3_error("NoSuchKey", key)
        return self.objects[key]


@pytest.fixture
def anyio_backend() -> str:
    """Force ``anyio``-marked tests onto asyncio (no Trio in our test deps)."""
    return "asyncio"


def _patch_metadata_for_sqlite() -> None:
    """Make PostgreSQL-specific DDL compatible with SQLite for tests.

    Replaces JSONB columns with JSON so ``Base.metadata.create_all`` succeeds
    against SQLite. Mirrors the same patch in MyBookkeeper's test conftest.
    """
    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, JSONB):
                column.type = JSON()


@pytest.fixture(autouse=True, scope="session")
def _patch_jsonb_for_sqlite_session() -> None:
    """Apply the JSONB→JSON patch once per test session.

    Any test that calls ``Base.metadata.create_all`` against SQLite (including
    tests that define their own ``db`` fixture, like ``test_audit.py``) needs
    this. Runs at session scope so it's idempotent and applies before any
    test-local fixtures touch metadata.
    """
    # Force-import every shared model so its table is registered with
    # ``Base.metadata`` before we walk it. Lazy importers would otherwise
    # leave the metadata empty until their tests run.
    from platform_shared.db.models.audit_log import AuditLog  # noqa: F401
    from platform_shared.db.models.auth_event import AuthEvent  # noqa: F401

    _patch_metadata_for_sqlite()


@pytest_asyncio.fixture()
async def db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an in-memory SQLite async session with the shared schema applied.

    Each test gets a fresh engine + database. The shared ``Base.metadata``
    is the registry — any model imported before the fixture runs will have
    its table created.
    """
    # Importing here ensures the AuthEvent table is registered with
    # Base.metadata before create_all runs, regardless of test discovery order.
    from platform_shared.db.models.auth_event import AuthEvent  # noqa: F401

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")

    @event.listens_for(engine.sync_engine, "connect")
    def _disable_fk(dbapi_conn, _rec):  # type: ignore[no-untyped-def]
        dbapi_conn.execute("PRAGMA foreign_keys=OFF")

    _patch_metadata_for_sqlite()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session

    await engine.dispose()
