"""remove_stored_files: one failing key never stops the rest and is logged."""
import logging
from unittest.mock import MagicMock

import pytest

from platform_shared.services.stored_file_removal import remove_stored_files


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

    assert "key=a.pdf" in caplog.text
    assert "key=b.pdf" in caplog.text
