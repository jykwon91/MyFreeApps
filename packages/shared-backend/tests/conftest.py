"""Shared-backend test config — registers asyncio mode and a fresh in-memory DB."""
import threading
from collections.abc import AsyncGenerator, Iterator

import pytest
import pytest_asyncio
from minio.error import S3Error
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from platform_shared.core.audit import reset_registry
from platform_shared.db.base import Base
from platform_shared.schemas.transparency import TRANSPARENCY_OBJECT_KEY, TransparencyDocument
from platform_shared.services.transparency import donation_store, transparency_store
from platform_shared.testing.sqlite_metadata import patch_metadata_for_sqlite


def make_s3_error(code: str, key: str = "obj") -> S3Error:
    """Build a minio ``S3Error`` with a given code for transparency tests.

    ``code="NoSuchKey"`` exercises the missing-object path; any other code
    exercises the transient-outage path that callers re-raise. minio's
    ``S3Error.__init__`` takes ``response`` FIRST, then code/message/...
    """
    return S3Error(None, code, f"{code} for {key}", key, "", "")


class FakeStorageClient:
    """In-memory stand-in for ``platform_shared.core.storage.StorageClient``.

    Backs the transparency tests without a real MinIO. ``download_file``
    raises a ``NoSuchKey`` ``S3Error`` for absent keys, matching the real
    client's behaviour that ``transparency_store.load_document`` depends on.

    ``read_barrier`` (optional) makes the first ``parties`` reads wait for
    each other, so concurrent writers all read before any of them writes:
    the interleaving that loses an update when they share one object.
    """

    def __init__(self, read_barrier: threading.Barrier | None = None) -> None:
        self.objects: dict[str, bytes] = {}
        self.uploads: list[tuple[str, bytes, str]] = []
        self._lock = threading.Lock()
        self._read_barrier = read_barrier
        self._reads = 0

    def upload_file(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> str:
        with self._lock:
            self.objects[key] = bytes(content)
            self.uploads.append((key, bytes(content), content_type))
        return key

    def download_file(self, key: str) -> bytes:
        with self._lock:
            found = self.objects.get(key)
            self._reads += 1
            waits = self._read_barrier is not None and self._reads <= self._read_barrier.parties
        if waits:
            assert self._read_barrier is not None
            self._read_barrier.wait()
        if found is None:
            raise make_s3_error("NoSuchKey", key)
        return found

    def object_exists(self, key: str) -> bool:
        with self._lock:
            return key in self.objects

    def list_keys(self, prefix: str) -> list[str]:
        with self._lock:
            return sorted(k for k in self.objects if k.startswith(prefix))

    def delete_files(self, keys: list[str]) -> list[str]:
        with self._lock:
            for key in keys:
                self.objects.pop(key, None)
        return []


def seed_transparency_document(fake: FakeStorageClient, document: TransparencyDocument) -> None:
    """Store ``document`` as the shared ``report.json``, as an earlier poll would."""
    fake.upload_file(
        TRANSPARENCY_OBJECT_KEY, document.model_dump_json().encode("utf-8"), "application/json",
    )


@pytest.fixture
def fake_storage(monkeypatch: pytest.MonkeyPatch) -> FakeStorageClient:
    """Point the transparency modules at a fresh in-memory store, caches cleared."""
    fake = FakeStorageClient()
    monkeypatch.setattr(transparency_store, "get_shared_storage", lambda settings: fake)
    transparency_store.reset_shared_storage_cache()
    donation_store.reset_donation_cache()
    return fake


@pytest.fixture
def anyio_backend() -> str:
    """Force ``anyio``-marked tests onto asyncio (no Trio in our test deps)."""
    return "asyncio"


@pytest.fixture(autouse=True)
def _isolate_audit_registry() -> Iterator[None]:
    """Give every test a clean audit registry and leave none behind.

    The registry and the SQLAlchemy ``after_flush`` listener it attaches are
    process-global. A test that registers a bogus field name, or runs the real
    lifespan (which attaches the listener), would otherwise break later tests:
    the lifespan validates leftover names, and a leftover listener writes
    ``audit_logs`` rows in suites whose schema has no such table.
    """
    reset_registry()
    yield
    reset_registry()


@pytest.fixture(autouse=True, scope="session")
def _patch_metadata_for_sqlite_session() -> None:
    """Apply the SQLite type patch once per test session.

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

    patch_metadata_for_sqlite(Base.metadata)


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

    patch_metadata_for_sqlite(Base.metadata)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session

    await engine.dispose()
