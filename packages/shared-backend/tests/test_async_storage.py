"""``async_storage`` keeps blocking MinIO calls off the event loop."""
from __future__ import annotations

import asyncio
import threading
import time
from unittest.mock import MagicMock

import pytest

from platform_shared.core import async_storage
from platform_shared.core.storage import StorageClient
from platform_shared.core.storage_constants import (
    STORAGE_CHECK_CONCURRENCY,
    STORAGE_POOL_MAXSIZE,
    STORAGE_THREAD_POOL_SIZE,
)
from tests.conftest import make_s3_error

_SLOW_CALL_SECONDS = 0.2


def _slow_storage() -> MagicMock:
    """A storage whose every call blocks its thread, like a slow MinIO."""
    storage = MagicMock(spec=StorageClient)

    def slow(*_args: object) -> bool:
        time.sleep(_SLOW_CALL_SECONDS)
        return True

    storage.upload_file.side_effect = lambda key, *_: (slow(), key)[1]
    storage.object_exists.side_effect = slow
    storage.download_file.side_effect = lambda _key: (slow(), b"data")[1]
    storage.delete_file.side_effect = lambda _key: (slow(), None)[1]
    storage.bucket_exists.side_effect = slow
    return storage


async def _loop_ticks_during(call: asyncio.Future[object] | object) -> int:
    """How many times a 10 ms ticker ran while ``call`` was awaited."""
    ticks = 0
    done = False

    async def ticker() -> None:
        nonlocal ticks
        while not done:
            ticks += 1
            await asyncio.sleep(0.01)

    task = asyncio.create_task(ticker())
    await asyncio.sleep(0)
    try:
        await call  # type: ignore[misc]
    finally:
        done = True
        await task
    return ticks


@pytest.mark.parametrize(
    "call",
    [
        lambda s: async_storage.upload_file(s, "k", b"x", "text/plain"),
        lambda s: async_storage.download_file(s, "k"),
        lambda s: async_storage.delete_file(s, "k"),
        lambda s: async_storage.objects_exist(s, ["a", "b"]),
        lambda s: async_storage.bucket_exists(s),
    ],
    ids=["upload", "download", "delete", "objects_exist", "bucket_exists"],
)
async def test_the_event_loop_keeps_running_during_a_slow_call(call) -> None:
    ticks = await _loop_ticks_during(call(_slow_storage()))
    # 200 ms of blocking at a 10 ms tick: a frozen loop would tick once.
    assert ticks >= 5


async def test_returns_what_the_client_returns() -> None:
    storage = MagicMock(spec=StorageClient)
    storage.upload_file.return_value = "k"
    storage.download_file.return_value = b"data"
    storage.delete_files.return_value = ["b"]
    storage.bucket_exists.return_value = True

    assert await async_storage.upload_file(storage, "k", b"x", "text/plain") == "k"
    storage.upload_file.assert_called_once_with("k", b"x", "text/plain")
    assert await async_storage.download_file(storage, "k") == b"data"
    assert await async_storage.delete_files(storage, ["a", "b"]) == ["b"]
    assert await async_storage.bucket_exists(storage) is True


async def test_objects_exist_keeps_the_order_of_the_keys() -> None:
    storage = MagicMock(spec=StorageClient)
    storage.object_exists.side_effect = lambda key: key != "gone"
    assert await async_storage.objects_exist(storage, ["a", "gone", "b"]) == [True, False, True]


async def test_objects_exist_with_no_keys_makes_no_call() -> None:
    storage = MagicMock(spec=StorageClient)
    assert await async_storage.objects_exist(storage, []) == []
    storage.object_exists.assert_not_called()


async def test_objects_exist_runs_checks_concurrently_up_to_the_limit() -> None:
    lock = threading.Lock()
    running = 0
    peak = 0

    def check(_key: str) -> bool:
        nonlocal running, peak
        with lock:
            running += 1
            peak = max(peak, running)
        time.sleep(0.05)
        with lock:
            running -= 1
        return True

    storage = MagicMock(spec=StorageClient)
    storage.object_exists.side_effect = check
    keys = [f"k{i}" for i in range(STORAGE_CHECK_CONCURRENCY * 3)]

    assert all(await async_storage.objects_exist(storage, keys))
    assert peak == STORAGE_CHECK_CONCURRENCY


async def test_the_check_limit_covers_concurrent_pages_together() -> None:
    lock = threading.Lock()
    running = 0
    peak = 0

    def check(_key: str) -> bool:
        nonlocal running, peak
        with lock:
            running += 1
            peak = max(peak, running)
        time.sleep(0.05)
        with lock:
            running -= 1
        return True

    storage = MagicMock(spec=StorageClient)
    storage.object_exists.side_effect = check
    pages = [[f"p{p}-k{i}" for i in range(STORAGE_CHECK_CONCURRENCY)] for p in range(3)]

    await asyncio.gather(*(async_storage.objects_exist(storage, keys) for keys in pages))

    assert peak == STORAGE_CHECK_CONCURRENCY


async def test_a_failed_check_raises_only_once_every_check_has_finished() -> None:
    finished: list[str] = []

    def check(key: str) -> bool:
        if key == "bad":
            raise ConnectionError("down")
        time.sleep(0.1)
        finished.append(key)
        return True

    storage = MagicMock(spec=StorageClient)
    storage.object_exists.side_effect = check

    with pytest.raises(ConnectionError):
        await async_storage.objects_exist(storage, ["bad", "a", "b"])
    assert sorted(finished) == ["a", "b"]


async def test_errors_propagate_unchanged() -> None:
    storage = MagicMock(spec=StorageClient)
    storage.object_exists.side_effect = make_s3_error("AccessDenied")
    storage.upload_file.side_effect = ConnectionError("down")

    with pytest.raises(Exception) as exc_info:
        await async_storage.objects_exist(storage, ["a"])
    assert getattr(exc_info.value, "code", None) == "AccessDenied"
    with pytest.raises(ConnectionError):
        await async_storage.upload_file(storage, "k", b"x", "text/plain")


async def test_a_cancelled_upload_returns_only_once_the_put_has_finished() -> None:
    started, release = threading.Event(), threading.Event()
    finished = threading.Event()

    def put(key: str, *_: object) -> str:
        started.set()
        release.wait(5)
        finished.set()
        return key

    storage = MagicMock(spec=StorageClient)
    storage.upload_file.side_effect = put

    task = asyncio.create_task(async_storage.upload_file(storage, "k", b"x", "text/plain"))
    await asyncio.to_thread(started.wait, 5)
    task.cancel()
    await asyncio.sleep(0.05)
    # Still waiting for the PUT: the caller's cleanup can't run before it lands.
    assert not task.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert finished.is_set()


async def test_a_cancel_repeated_while_the_put_runs_still_waits_for_it() -> None:
    started, release = threading.Event(), threading.Event()
    finished = threading.Event()

    def put(key: str, *_: object) -> str:
        started.set()
        release.wait(5)
        finished.set()
        return key

    storage = MagicMock(spec=StorageClient)
    storage.upload_file.side_effect = put

    task = asyncio.create_task(async_storage.upload_file(storage, "k", b"x", "text/plain"))
    await asyncio.to_thread(started.wait, 5)
    task.cancel()
    await asyncio.sleep(0.02)
    task.cancel()  # anyio cancel scopes re-deliver cancellation like this
    await asyncio.sleep(0.05)
    assert not task.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert finished.is_set()


def test_storage_threads_fit_in_the_connection_pool() -> None:
    assert STORAGE_CHECK_CONCURRENCY <= STORAGE_THREAD_POOL_SIZE <= STORAGE_POOL_MAXSIZE


async def test_a_stalled_storage_leaves_the_default_thread_pool_free() -> None:
    release = threading.Event()
    storage = MagicMock(spec=StorageClient)
    storage.upload_file.side_effect = lambda key, *_: (release.wait(5), key)[1]

    # Far more stalled uploads than the default executor has threads.
    uploads = [
        asyncio.create_task(async_storage.upload_file(storage, f"k{i}", b"x", "text/plain"))
        for i in range(64)
    ]
    await asyncio.sleep(0.05)
    try:
        started = time.monotonic()
        assert await asyncio.wait_for(asyncio.to_thread(lambda: "free"), timeout=1) == "free"
        assert time.monotonic() - started < 0.5
    finally:
        release.set()
        await asyncio.gather(*uploads)


def test_bucket_exists_asks_about_the_clients_own_bucket() -> None:
    minio = MagicMock()
    minio.bucket_exists.return_value = False
    assert StorageClient(minio, "files").bucket_exists() is False
    minio.bucket_exists.assert_called_once_with("files")
