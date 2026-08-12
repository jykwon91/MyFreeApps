import os
from collections.abc import AsyncGenerator
from unittest.mock import MagicMock

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
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.user.user import User
from platform_shared.testing.factories import make_user_fixture


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
    fake.generate_presigned_url.side_effect = (
        lambda key, ttl, **_kwargs: f"https://signed/{key}"
    )
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


@pytest_asyncio.fixture(scope="session")
async def _db_engine() -> AsyncGenerator[AsyncEngine, None]:
    """One in-memory database, built once for the whole run.

    The schema is 81 tables and 178 indexes. Creating it per test meant 259
    DDL statements before every one of ~3.5k tests, which was the bulk of a
    ten-minute suite. ``StaticPool`` keeps every connection pointed at the
    same in-memory database so the schema survives between tests; isolation
    comes from the per-test transaction in ``db`` below.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _set_fk(dbapi_conn, _rec):  # type: ignore[no-untyped-def]
        dbapi_conn.execute("PRAGMA foreign_keys=OFF")

    _patch_metadata_for_sqlite()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    await engine.dispose()


@pytest_asyncio.fixture()
async def db(_db_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """A session on the shared database, emptied when the test ends.

    Rows are deleted rather than rolled back: services under test commit
    through their own sessions, and wrapping those in a savepoint made a
    commit stop meaning what it means in production. Deleting afterwards
    keeps commit semantics identical to a real database while still
    skipping the schema rebuild — 81 DELETEs against mostly-empty tables
    against 259 DDL statements.
    """
    session = AsyncSession(bind=_db_engine, expire_on_commit=False)
    try:
        yield session
    finally:
        await session.close()
        async with _db_engine.begin() as conn:
            for table in reversed(Base.metadata.sorted_tables):
                await conn.execute(table.delete())


@pytest.fixture()
def audit_listeners():
    """Attach the audit listener for one test, then put the registry back.

    The listener lives on the global SQLAlchemy ``Session`` class, so leaving
    it attached makes every later test in the session write an audit row per
    changed field — the demo-seeding tests went from 664 to 15,230 statements
    purely from listener leakage. Any test that needs the listener must take
    this fixture rather than calling ``register_audit_listeners()`` directly.

    ``reset_registry()`` also clears the sensitive / skip sets, so the
    import-time registrations from ``app.core.audit`` are re-applied here to
    leave global state exactly as it was found.
    """
    from app.core.audit import (
        MBK_SENSITIVE_FIELDS,
        MBK_SKIP_FIELDS,
        MBK_SKIP_TABLES,
        register_audit_listeners,
    )
    from platform_shared.core.audit import (
        register_sensitive_fields,
        register_skip_fields,
        register_skip_tables,
        reset_registry,
    )

    register_audit_listeners()
    try:
        yield
    finally:
        reset_registry()
        register_sensitive_fields(MBK_SENSITIVE_FIELDS)
        register_skip_tables(MBK_SKIP_TABLES)
        register_skip_fields(MBK_SKIP_FIELDS)


test_user, test_org = make_user_fixture(
    user_model=User,
    org_model=Organization,
    org_member_model=OrganizationMember,
)
