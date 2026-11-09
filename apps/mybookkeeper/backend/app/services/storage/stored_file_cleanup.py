"""Remove stored files once the database change that orphaned them has committed."""
import asyncio
import logging

from app.core.storage import get_storage

logger = logging.getLogger(__name__)


async def delete_stored_files(storage_keys: list[str]) -> None:
    """Best-effort batched removal; failures are logged, never raised.

    Runs off the event loop because MinIO calls block.
    """
    if not storage_keys:
        return
    storage = get_storage()
    if storage is None:
        logger.warning(
            "Object storage is not configured; %d stored file(s) were left behind: %s",
            len(storage_keys), storage_keys,
        )
        return
    try:
        failed = await asyncio.to_thread(storage.delete_files, storage_keys)
    except Exception:  # noqa: BLE001
        logger.warning("Failed to delete stored files %s", storage_keys, exc_info=True)
        return
    for key in failed:
        logger.warning("Failed to delete stored file %s", key)
