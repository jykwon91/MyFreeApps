"""Remove stored files once the database change that orphaned them has committed."""
import asyncio
import logging
from contextlib import suppress
from typing import Any

from app.core.storage import get_storage

logger = logging.getLogger(__name__)


async def delete_stored_files(storage_keys: list[str]) -> None:
    """Best-effort batched removal; failures are logged, never raised.

    Runs off the event loop because MinIO calls block.
    """
    if not storage_keys:
        return
    try:
        storage = get_storage()
        failed = await asyncio.to_thread(storage.delete_files, storage_keys)
    except Exception:  # noqa: BLE001
        logger.warning("Failed to delete stored files %s", storage_keys, exc_info=True)
        return
    for key in failed:
        logger.warning("Failed to delete stored file %s", key)


async def discard_after_in_flight(
    storage_keys: list[str], in_flight: asyncio.Future[Any] | None,
) -> None:
    """Remove ``storage_keys`` once an upload still running in a worker thread has landed.

    A cancelled request leaves its thread running; deleting first would let the
    object appear afterwards.
    """
    if in_flight is not None:
        with suppress(BaseException):
            await asyncio.wait([in_flight])
    await delete_stored_files(storage_keys)
