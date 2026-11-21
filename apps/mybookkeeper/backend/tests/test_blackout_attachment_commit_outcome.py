"""A blackout attachment is removed from storage only when its row surely isn't there.

The object is uploaded before the row is written. A failure while writing
removes it. After a COMMIT that raised, the outcome check (under the blackout's
row lock) decides: rows there means the upload succeeded; a blackout gone
means nothing points at the file.
"""
from __future__ import annotations

import io
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from PIL import Image

from app.services.listings import blackout_service

pytestmark = pytest.mark.asyncio


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buf, format="PNG")
    return buf.getvalue()


async def _upload_with(
    uow,  # noqa: ANN001
    storage: MagicMock,
    create,  # noqa: ANN001
    *,
    scope_results: list[object] | None = None,
    still_there: object = None,
    stored_rows: list[object] | None = None,
) -> None:
    scope = AsyncMock(side_effect=scope_results) if scope_results else AsyncMock(return_value=MagicMock())
    with (
        patch.object(blackout_service, "get_storage", return_value=storage),
        patch.object(blackout_service, "unit_of_work", uow),
        patch.object(blackout_service.listing_blackout_repo, "get_by_id_scoped_to_organization", new=scope),
        patch.object(blackout_service.listing_blackout_repo, "lock_by_id", new=AsyncMock(return_value=still_there)),
        patch.object(blackout_service.listing_blackout_attachment_repo, "create", new=create),
        patch.object(
            blackout_service.listing_blackout_attachment_repo, "list_by_blackout",
            new=AsyncMock(return_value=stored_rows if stored_rows is not None else []),
        ),
        patch.object(blackout_service, "attach_presigned_urls", side_effect=lambda rows: rows),
    ):
        await blackout_service.upload_attachment(uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), _png(), "a.png")


async def _create(_db: object, **row: object) -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), presigned_url=None, **row)


@asynccontextmanager
async def _uow() -> AsyncIterator[MagicMock]:
    yield MagicMock()


def _storage() -> MagicMock:
    storage = MagicMock()
    storage.delete_files.return_value = []
    return storage


async def test_a_failed_row_write_removes_the_stored_attachment() -> None:
    storage = _storage()

    async def failing_create(_db: object, **_row: object) -> None:
        raise RuntimeError("insert failed")

    with pytest.raises(RuntimeError, match="insert failed"):
        await _upload_with(_uow, storage, failing_create)

    key = storage.upload_file.call_args.args[0]
    storage.delete_files.assert_called_once_with([key])


async def test_a_blackout_deleted_during_the_upload_is_refused_and_its_file_removed() -> None:
    storage = _storage()
    create = AsyncMock()

    with pytest.raises(blackout_service.BlackoutNotFoundError):
        await _upload_with(_uow, storage, create, scope_results=[MagicMock(), None])

    create.assert_not_called()
    key = storage.upload_file.call_args.args[0]
    storage.delete_files.assert_called_once_with([key])


class _CommitFails:
    """The insert's COMMIT raises (the scope check commits first)."""

    def __init__(self) -> None:
        self.opened = 0

    @asynccontextmanager
    async def __call__(self) -> AsyncIterator[MagicMock]:
        self.opened += 1
        yield MagicMock()
        if self.opened == 2:
            raise ConnectionError("connection lost during COMMIT")


async def test_a_commit_that_raised_but_landed_keeps_the_attachment() -> None:
    storage = _storage()

    async def create(_db: object, **row: object) -> SimpleNamespace:
        stored.append(SimpleNamespace(storage_key=row["storage_key"]))
        return await _create(_db, **row)

    stored: list[SimpleNamespace] = []
    await _upload_with(_CommitFails(), storage, create, still_there=MagicMock(), stored_rows=stored)

    storage.upload_file.assert_called_once()
    storage.delete_files.assert_not_called()


async def test_a_commit_that_raised_with_the_blackout_gone_removes_the_attachment() -> None:
    """The blackout was deleted (its attachments cascade): nothing points at the file."""
    storage = _storage()

    with pytest.raises(ConnectionError):
        await _upload_with(_CommitFails(), storage, _create, still_there=None)

    key = storage.upload_file.call_args.args[0]
    storage.delete_files.assert_called_once_with([key])
