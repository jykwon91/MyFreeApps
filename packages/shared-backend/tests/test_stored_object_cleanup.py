"""``delete_stored_files`` logs what it could not remove and never raises."""
from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest

from platform_shared.core.storage import StorageClient
from platform_shared.services.storage import stored_object_cleanup
from platform_shared.services.storage.stored_object_cleanup import delete_stored_files


async def test_no_keys_makes_no_call() -> None:
    storage = MagicMock(spec=StorageClient)

    await delete_stored_files(storage, [])

    storage.delete_files.assert_not_called()


async def test_keys_left_behind_are_logged(caplog: pytest.LogCaptureFixture) -> None:
    storage = MagicMock(spec=StorageClient)
    storage.delete_files.return_value = ["b"]

    with caplog.at_level(logging.WARNING, logger=stored_object_cleanup.__name__):
        await delete_stored_files(storage, ["a", "b"])

    assert "Failed to delete stored file b" in caplog.text


async def test_an_outage_is_logged_not_raised(caplog: pytest.LogCaptureFixture) -> None:
    storage = MagicMock(spec=StorageClient)
    storage.delete_files.side_effect = ConnectionError("MinIO went away")

    with caplog.at_level(logging.WARNING, logger=stored_object_cleanup.__name__):
        await delete_stored_files(storage, ["a"])

    assert "['a']" in caplog.text
