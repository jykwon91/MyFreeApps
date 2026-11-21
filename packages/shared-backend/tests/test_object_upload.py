"""``upload_objects`` stores every object or none of them."""
from __future__ import annotations

import asyncio
import threading
from unittest.mock import MagicMock

import pytest

from platform_shared.core.storage import StorageClient
from platform_shared.schemas.storage.new_stored_object import NewStoredObject
from platform_shared.services.storage.object_upload import upload_objects

_OBJECTS = [NewStoredObject(f"k{i}", b"x", "text/plain") for i in range(3)]


def _storage() -> MagicMock:
    storage = MagicMock(spec=StorageClient)
    storage.upload_file.side_effect = lambda key, *_: key
    storage.delete_files.return_value = []
    return storage


async def test_uploads_every_object_in_order() -> None:
    storage = _storage()

    await upload_objects(storage, _OBJECTS)

    assert [c.args[0] for c in storage.upload_file.call_args_list] == ["k0", "k1", "k2"]
    storage.delete_files.assert_not_called()


async def test_a_failed_upload_removes_everything_attempted() -> None:
    storage = _storage()
    storage.upload_file.side_effect = ["k0", ConnectionError("MinIO went away")]

    with pytest.raises(ConnectionError):
        await upload_objects(storage, _OBJECTS)

    storage.delete_files.assert_called_once_with(["k0", "k1"])


async def test_a_cancelled_upload_removes_what_landed_after_the_put_ends() -> None:
    started, release = threading.Event(), threading.Event()
    storage = _storage()

    def put(key: str, *_: object) -> str:
        started.set()
        release.wait(5)
        return key

    storage.upload_file.side_effect = put
    task = asyncio.create_task(upload_objects(storage, _OBJECTS))
    await asyncio.to_thread(started.wait, 5)
    task.cancel()
    await asyncio.sleep(0.02)
    task.cancel()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task

    storage.delete_files.assert_called_once_with(["k0"])
