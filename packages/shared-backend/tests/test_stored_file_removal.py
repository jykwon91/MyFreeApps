"""remove_stored_files: one failing key never stops the rest and is logged."""
import logging
from unittest.mock import MagicMock

import pytest

from platform_shared.core.storage import StorageClient
from platform_shared.services.stored_file_removal import remove_stored_files
from tests.conftest import make_s3_error


def test_every_key_is_deleted() -> None:
    storage = MagicMock()

    remove_stored_files(lambda: storage, ["a.pdf", "b.pdf"])

    assert [call.args[0] for call in storage.delete_file.call_args_list] == ["a.pdf", "b.pdf"]


def test_one_failing_key_does_not_stop_the_rest() -> None:
    storage = MagicMock()
    storage.delete_file.side_effect = [ConnectionError("down"), None]

    remove_stored_files(lambda: storage, ["a.pdf", "b.pdf"])

    assert storage.delete_file.call_count == 2


def test_unreachable_storage_logs_every_key_left_behind(caplog: pytest.LogCaptureFixture) -> None:
    def unreachable() -> MagicMock:
        raise RuntimeError("no storage")

    with caplog.at_level(logging.ERROR):
        remove_stored_files(unreachable, ["a.pdf", "b.pdf"])

    # No S3 code to report, so the exception's type stands in for it.
    assert "key=a.pdf code=RuntimeError" in caplog.text
    assert "key=b.pdf code=RuntimeError" in caplog.text


def test_an_object_minio_refuses_to_delete_is_logged_as_left_behind(
    caplog: pytest.LogCaptureFixture,
) -> None:
    minio = MagicMock()
    minio.remove_object.side_effect = [make_s3_error("AccessDenied", "a.pdf"), None]
    storage = StorageClient(minio, "bucket")

    with caplog.at_level(logging.ERROR):
        remove_stored_files(lambda: storage, ["a.pdf", "b.pdf"])

    left_behind = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert [r.getMessage() for r in left_behind] == [
        "Stored file left behind after account deletion: key=a.pdf code=AccessDenied",
    ]
    assert minio.remove_object.call_count == 2
