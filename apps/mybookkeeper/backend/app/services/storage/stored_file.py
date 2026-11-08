"""Read a stored file, telling "the file is gone" apart from a storage outage.

``StorageClient.download_file`` lets minio's ``S3Error`` through, so a row
whose object was deleted reads the same as MinIO being down, and callers
answered both with a 500. ``read_stored_file`` raises ``StoredFileMissingError``
for the first so callers can tell the user which file to re-upload; any other
storage error still propagates.
"""
from __future__ import annotations

from minio.error import S3Error
from platform_shared.core.storage import StorageClient

_MISSING_CODES = frozenset({"NoSuchKey", "NoSuchObject"})


class StoredFileMissingError(LookupError):
    """The database points at an object that is no longer in storage."""

    def __init__(self, storage_key: str) -> None:
        self.storage_key = storage_key
        super().__init__(f"Stored file is missing: {storage_key}")


def read_stored_file(storage: StorageClient, storage_key: str) -> bytes:
    try:
        return storage.download_file(storage_key)
    except S3Error as exc:
        if exc.code in _MISSING_CODES:
            raise StoredFileMissingError(storage_key) from exc
        raise
