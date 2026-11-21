"""Call the storage client from async code without freezing the event loop.

minio-py is synchronous: every call blocks its thread until MinIO answers, for
up to the timeouts in ``storage_constants``. Called straight from a coroutine it
freezes the whole worker, so every other request waits too. Async code uses
these instead of the ``StorageClient`` methods; each runs the call on a thread
pool kept for storage, so a slow MinIO can't take the threads that other
blocking work (email, SMS, file parsing) gets from the default executor.
Errors propagate unchanged.

Every call returns or raises only once its thread is done, even when the
caller is cancelled (see ``run_to_completion``). A cancelled coroutine can't
stop the thread, so returning early would let an object land, or vanish,
after the caller's cleanup had already run, and would let more calls queue up
than there are threads.
"""
from __future__ import annotations

import asyncio
import weakref
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from typing import TypeVar, cast

from platform_shared.core.run_to_completion import run_to_completion
from platform_shared.core.storage import StorageClient
from platform_shared.core.storage_constants import (
    STORAGE_CHECK_CONCURRENCY,
    STORAGE_THREAD_POOL_SIZE,
)

_R = TypeVar("_R")

# Its threads start on first use. A process forked after that (multiprocessing
# with the "fork" start method, or a pre-forking server that loads the app before
# forking) inherits a pool that believes its threads exist when none run in the
# child, so storage calls there would queue forever. Fork before any storage
# call, or use the "spawn" start method; uvicorn's workers are spawned.
_EXECUTOR = ThreadPoolExecutor(
    max_workers=STORAGE_THREAD_POOL_SIZE, thread_name_prefix="storage",
)

# One check limit per event loop. A process serves requests on one loop, so this
# bounds every read page's checks together; tests that run several loops each
# get their own (an asyncio.Semaphore can't be shared between loops).
_CHECK_LIMITS: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = (
    weakref.WeakKeyDictionary()
)


def _check_limit() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    limit = _CHECK_LIMITS.get(loop)
    if limit is None:
        limit = _CHECK_LIMITS[loop] = asyncio.Semaphore(STORAGE_CHECK_CONCURRENCY)
    return limit


async def _run(call: Callable[[], _R]) -> _R:
    loop = asyncio.get_running_loop()
    return await run_to_completion(loop.run_in_executor(_EXECUTOR, call))


async def upload_file(
    storage: StorageClient, key: str, content: bytes, content_type: str,
) -> str:
    return await _run(lambda: storage.upload_file(key, content, content_type))


async def download_file(storage: StorageClient, key: str) -> bytes:
    return await _run(lambda: storage.download_file(key))


async def delete_file(storage: StorageClient, key: str) -> None:
    await _run(lambda: storage.delete_file(key))


async def delete_files(storage: StorageClient, keys: list[str]) -> list[str]:
    return await _run(lambda: storage.delete_files(keys))


async def objects_exist(storage: StorageClient, keys: Sequence[str]) -> list[bool]:
    """Whether each object exists, in the order of ``keys``.

    The checks run concurrently, at most ``STORAGE_CHECK_CONCURRENCY`` at a
    time across the whole process, so concurrent pages can't take every storage
    thread. Returns only once every check is done; then the first error raised
    by ``object_exists``, if any, propagates.
    """
    limit = _check_limit()

    async def exists(key: str) -> bool:
        async with limit:
            return await _run(lambda: storage.object_exists(key))

    results = await asyncio.gather(*(exists(key) for key in keys), return_exceptions=True)
    for result in results:
        if isinstance(result, BaseException):
            raise result
    # No exceptions remain, so every result is the check's bool.
    return cast(list[bool], results)


async def bucket_exists(storage: StorageClient) -> bool:
    return await _run(storage.bucket_exists)


__all__ = [
    "bucket_exists",
    "delete_file",
    "delete_files",
    "download_file",
    "objects_exist",
    "upload_file",
]
