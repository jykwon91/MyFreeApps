"""Remove stored objects nothing points at any more."""
from __future__ import annotations

import logging

from platform_shared.core import async_storage
from platform_shared.core.storage import StorageClient

logger = logging.getLogger(__name__)


async def delete_stored_files(storage: StorageClient, storage_keys: list[str]) -> None:
    """Best-effort batched removal; failures are logged by key, never raised.

    Returns only once the delete is over, even if the caller is cancelled.
    """
    if not storage_keys:
        return
    try:
        failed = await async_storage.delete_files(storage, storage_keys)
    except Exception:  # noqa: BLE001
        logger.warning("Failed to delete stored files %s", storage_keys, exc_info=True)
        return
    for key in failed:
        logger.warning("Failed to delete stored file %s", key)


__all__ = ["delete_stored_files"]
