"""Remove an account's stored files once its rows are gone."""
from __future__ import annotations

import logging
from collections.abc import Callable

from platform_shared.core.storage import StorageClient

logger = logging.getLogger(__name__)


def remove_stored_files(
    get_storage: Callable[[], StorageClient], storage_keys: list[str],
) -> None:
    """Delete an account's stored files once its rows are gone.

    The account can't come back by now, so one failure mustn't stop the rest.
    Anything left is logged by key, which is all that's needed to remove it. The
    keys are only in memory, so a restart before this runs leaves files with no
    record of them.
    """
    for key in storage_keys:
        try:
            get_storage().delete_file(key)
        except Exception:
            logger.exception("Stored file left behind after account deletion: key=%s", key)
