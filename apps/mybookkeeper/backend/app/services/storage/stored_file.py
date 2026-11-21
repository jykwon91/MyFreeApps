"""Read a stored file, telling "the file is gone" apart from a storage outage.

``StorageClient.download_file`` lets minio's ``S3Error`` through, so a row
whose object was deleted reads the same as MinIO being down, and callers
answered both with a 500. ``read_stored_file`` raises ``StoredFileMissingError``
for the first so callers can tell the user which file to re-upload; any other
storage error still propagates. ``load_stored_file`` is the same read for async
code, run off the event loop.
"""
from __future__ import annotations

from minio.error import S3Error
from platform_shared.core import async_storage
from platform_shared.core.storage import StorageClient
from platform_shared.core.storage_constants import STORAGE_MISSING_OBJECT_CODES


class StoredFileMissingError(LookupError):
    """The database points at an object that is no longer in storage."""

    def __init__(self, storage_key: str) -> None:
        self.storage_key = storage_key
        super().__init__(f"Stored file is missing: {storage_key}")


def read_stored_file(storage: StorageClient, storage_key: str) -> bytes:
    try:
        return storage.download_file(storage_key)
    except S3Error as exc:
        _raise_if_missing(exc, storage_key)
        raise


async def load_stored_file(storage: StorageClient, storage_key: str) -> bytes:
    try:
        return await async_storage.download_file(storage, storage_key)
    except S3Error as exc:
        _raise_if_missing(exc, storage_key)
        raise


def _raise_if_missing(exc: S3Error, storage_key: str) -> None:
    if exc.code in STORAGE_MISSING_OBJECT_CODES:
        raise StoredFileMissingError(storage_key) from exc
