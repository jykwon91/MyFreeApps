"""Resume and document uploads keep MinIO calls off the event loop.

minio-py blocks its thread until MinIO answers. Called straight from these
async services it froze the worker, so every other request waited on a slow
upload.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from contextlib import ExitStack, asynccontextmanager, contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.documents import document_service
from app.services.jobs import resume_upload_service

_PDF = b"%PDF-1.4 " + b"A" * 100
_SLOW_SECONDS = 0.2


def _slow_storage() -> MagicMock:
    storage = MagicMock()
    storage.generate_key.return_value = "uploads/k/file.pdf"

    def slow_upload(key: str, _content: bytes, _content_type: str) -> str:
        time.sleep(_SLOW_SECONDS)
        return key

    storage.upload_file.side_effect = slow_upload
    return storage


async def _loop_ticks_during(call: Awaitable[object]) -> int:
    ticks = 0
    done = False

    async def ticker() -> None:
        nonlocal ticks
        while not done:
            ticks += 1
            await asyncio.sleep(0.01)

    task = asyncio.create_task(ticker())
    await asyncio.sleep(0)
    try:
        await call
    finally:
        done = True
        await task
    return ticks


@asynccontextmanager
async def _fake_uow() -> AsyncIterator[MagicMock]:
    yield MagicMock()


def _upload_resume() -> Awaitable[object]:
    return resume_upload_service.create_upload(
        file_bytes=_PDF, filename="resume.pdf", content_type="application/pdf",
        user_id=uuid.uuid4(), profile_id=uuid.uuid4(),
    )


def _upload_document() -> Awaitable[object]:
    return document_service.create_file_document(
        uuid.uuid4(), title="Cover letter", kind="cover_letter", application_id=None,
        file_bytes=_PDF, filename="letter.pdf", declared_content_type="application/pdf",
    )


async def test_a_slow_resume_upload_does_not_freeze_the_event_loop() -> None:
    with (
        patch.object(resume_upload_service, "get_storage", return_value=_slow_storage()),
        patch.object(resume_upload_service, "unit_of_work", _fake_uow),
        patch.object(resume_upload_service.resume_upload_job_repo, "create", AsyncMock()),
    ):
        ticks = await _loop_ticks_during(_upload_resume())

    # 200 ms of blocking at a 10 ms tick: a frozen loop would tick once.
    assert ticks >= 5


async def test_a_slow_document_upload_does_not_freeze_the_event_loop() -> None:
    with (
        patch.object(document_service, "get_storage", return_value=_slow_storage()),
        patch.object(document_service, "unit_of_work", _fake_uow),
        patch.object(document_service.document_repo, "create", AsyncMock()),
        patch.object(document_service, "_to_response", MagicMock()),
    ):
        ticks = await _loop_ticks_during(_upload_document())

    assert ticks >= 5


@pytest.mark.parametrize("service", ["resume", "document"])
async def test_a_failed_row_write_removes_the_stored_object(service: str) -> None:
    storage = _slow_storage()
    storage.delete_files.return_value = []
    with _patched(service, storage, create=AsyncMock(side_effect=RuntimeError("insert failed"))):
        with pytest.raises(RuntimeError, match="insert failed"):
            await _upload(service)

    storage.delete_files.assert_called_once_with(["uploads/k/file.pdf"])


@pytest.mark.parametrize("service", ["resume", "document"])
async def test_a_stored_object_that_cannot_be_cleaned_up_is_logged(
    service: str, caplog: pytest.LogCaptureFixture,
) -> None:
    storage = _slow_storage()
    storage.delete_files.side_effect = ConnectionError("MinIO went away")
    with (
        _patched(service, storage, create=AsyncMock(side_effect=RuntimeError("insert failed"))),
        caplog.at_level(logging.WARNING),
        pytest.raises(RuntimeError, match="insert failed"),
    ):
        await _upload(service)

    assert "uploads/k/file.pdf" in caplog.text


@pytest.mark.parametrize("service", ["resume", "document"])
async def test_a_commit_that_raised_keeps_the_stored_object(service: str) -> None:
    """The COMMIT may have landed; a row would then point at a deleted file."""
    storage = _slow_storage()
    with _patched(service, storage, create=AsyncMock(), uow=_CommitFails()):
        with pytest.raises(ConnectionError):
            await _upload(service)

    storage.upload_file.assert_called_once()
    storage.delete_files.assert_not_called()
    storage.delete_file.assert_not_called()


class _CommitFails:
    """The first transaction's COMMIT raises; the outcome check then finds no row."""

    def __init__(self) -> None:
        self._opened = 0

    @asynccontextmanager
    async def __call__(self) -> AsyncIterator[MagicMock]:
        self._opened += 1
        session = MagicMock()
        session.execute = AsyncMock(return_value=MagicMock(first=MagicMock(return_value=None)))
        yield session
        if self._opened == 1:
            raise ConnectionError("connection lost during COMMIT")


@contextmanager
def _patched(
    service: str, storage: MagicMock, *, create: AsyncMock, uow: Callable[[], object] = _fake_uow,
) -> Iterator[None]:
    module = resume_upload_service if service == "resume" else document_service
    repo = resume_upload_service.resume_upload_job_repo if service == "resume" else document_service.document_repo
    with ExitStack() as stack:
        stack.enter_context(patch.object(module, "get_storage", return_value=storage))
        stack.enter_context(patch.object(module, "unit_of_work", uow))
        stack.enter_context(patch.object(repo, "create", create))
        if service == "document":
            stack.enter_context(patch.object(document_service, "_to_response", MagicMock()))
        yield


def _upload(service: str) -> Awaitable[object]:
    return _upload_resume() if service == "resume" else _upload_document()
