"""Upload several objects as one unit, before the rows that will point at them."""
from __future__ import annotations

from collections.abc import Sequence

from platform_shared.core import async_storage
from platform_shared.core.run_to_completion import run_to_completion
from platform_shared.core.storage import StorageClient
from platform_shared.schemas.storage.new_stored_object import NewStoredObject
from platform_shared.services.storage.stored_object_cleanup import delete_stored_files


async def upload_objects(storage: StorageClient, objects: Sequence[NewStoredObject]) -> None:
    """Upload every object, one after another, all-or-nothing.

    On any failure, including cancellation, every object attempted so far is
    removed (the one being written too, since a PUT can land even when it
    raises) and the error is re-raised.
    """
    attempted: list[str] = []
    try:
        for obj in objects:
            attempted.append(obj.key)
            await async_storage.upload_file(storage, obj.key, obj.content, obj.content_type)
    except BaseException:
        await run_to_completion(delete_stored_files(storage, attempted))
        raise


__all__ = ["upload_objects"]
