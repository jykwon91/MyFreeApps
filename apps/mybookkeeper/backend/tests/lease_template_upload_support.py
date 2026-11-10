"""Shared fixtures and helpers for the atomic lease-template upload tests."""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core import storage as storage_module
from app.models.leases.lease_template import LeaseTemplate
from app.models.leases.lease_template_file import LeaseTemplateFile
from app.models.leases.lease_template_placeholder import LeaseTemplatePlaceholder

UPLOAD_SERVICE = "app.services.leases.lease_template_upload_service"
TEMPLATE_SERVICE = "app.services.leases.lease_template_service"

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
CORRUPT_DOCX = b"this is not a zip archive"
MARKDOWN = b"# Lease\nTenant: [TENANT FULL NAME]\n"
PLAIN = b"House rules for [TENANT FULL NAME]\n"


class CommitFailedError(RuntimeError):
    """Stands in for a database failure at commit time."""


UnitOfWorkFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]


@pytest.fixture
def storage() -> Iterator[MagicMock]:
    """The conftest storage fake, with deletes reporting success."""
    fake = storage_module._client
    assert isinstance(fake, MagicMock)
    fake.delete_files.return_value = []
    yield fake


@pytest_asyncio.fixture
async def real_unit_of_work(
    _db_engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[UnitOfWorkFactory]:
    """A genuine commit/rollback ``unit_of_work`` patched into the services."""
    maker = async_sessionmaker(_db_engine, expire_on_commit=False)

    @asynccontextmanager
    async def unit_of_work() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            async with session.begin():
                yield session

    monkeypatch.setattr(f"{UPLOAD_SERVICE}.unit_of_work", unit_of_work)
    monkeypatch.setattr(f"{TEMPLATE_SERVICE}.unit_of_work", unit_of_work)
    yield unit_of_work


def failing_commit(
    real: UnitOfWorkFactory, *, on_call: int = 1, unreachable_after: bool = False,
) -> UnitOfWorkFactory:
    """A unit of work whose ``on_call``-th use succeeds in its block but fails to
    commit (rolls back). Earlier and later uses behave normally, unless
    ``unreachable_after`` makes every later use (the outcome check) fail to open."""
    calls = {"n": 0}

    @asynccontextmanager
    async def unit_of_work() -> AsyncIterator[AsyncSession]:
        calls["n"] += 1
        if unreachable_after and calls["n"] > on_call:
            raise ConnectionError("database unreachable")
        fail = calls["n"] == on_call
        async with real() as session:
            yield session
            if fail:
                raise CommitFailedError("commit failed")

    return unit_of_work


def commit_succeeds_then_raises(real: UnitOfWorkFactory, *, on_call: int = 1) -> UnitOfWorkFactory:
    """A unit of work whose ``on_call``-th use commits, then reports a failure
    (e.g. a dropped connection). Other uses behave normally."""
    calls = {"n": 0}

    @asynccontextmanager
    async def unit_of_work() -> AsyncIterator[AsyncSession]:
        calls["n"] += 1
        fail = calls["n"] == on_call
        async with real() as session:
            yield session
        if fail:
            raise CommitFailedError("connection lost after commit")

    return unit_of_work


@asynccontextmanager
async def unreachable_database() -> AsyncIterator[AsyncSession]:
    """A unit of work that cannot even open (the follow-up check fails too)."""
    raise ConnectionError("database unreachable")
    yield  # pragma: no cover


def upload_fails_on_call(storage: MagicMock, call_number: int) -> None:
    """Make the ``call_number``-th ``upload_file`` call (1-based) raise."""
    calls = {"n": 0}

    def upload(key: str, content: bytes, content_type: str) -> str:
        calls["n"] += 1
        if calls["n"] == call_number:
            raise OSError("storage unavailable")
        return key

    storage.upload_file.side_effect = upload


def uploaded_keys(storage: MagicMock) -> list[str]:
    return [call.args[0] for call in storage.upload_file.call_args_list]


def deleted_keys(storage: MagicMock) -> list[str]:
    return [key for call in storage.delete_files.call_args_list for key in call.args[0]]


async def count_rows(db: AsyncSession) -> tuple[int, int, int]:
    """(templates, files, placeholders) currently committed."""
    db.expire_all()
    counts = [
        (await db.execute(select(func.count()).select_from(model))).scalar_one()
        for model in (LeaseTemplate, LeaseTemplateFile, LeaseTemplatePlaceholder)
    ]
    return counts[0], counts[1], counts[2]


def new_tenant() -> tuple[uuid.UUID, uuid.UUID]:
    return uuid.uuid4(), uuid.uuid4()
