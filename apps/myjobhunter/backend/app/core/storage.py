"""MyJobHunter storage client — thin wrapper over ``platform_shared.core.storage``.

The full ``StorageClient`` + ``_DualEndpointStorageClient`` lives in shared.
This module just builds the singleton from MJH's ``settings`` and caches
it; existing call sites continue to import ``StorageClient``,
``StorageNotConfiguredError``, ``get_storage``, and ``reset_client_cache``
from here.

Storage is a HARD REQUIREMENT for MJH: resume files all depend on it. The
FastAPI lifespan verifies bucket reachability at startup (see
``services/storage/bucket_initializer.py``) and refuses to boot on failure.
"""
from platform_shared.core.storage import (
    StorageClient,
    StorageNotConfiguredError,
    _DualEndpointStorageClient,  # noqa: F401 — re-exported for tests
    _parse_endpoint,  # noqa: F401 — re-exported for tests
    build_storage_client,
)

from app.core.config import settings

_client: StorageClient | None = None


def get_storage() -> StorageClient:
    """Return the cached MinIO storage client, building it if needed.

    Raises ``StorageNotConfiguredError`` if the required env vars
    (MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_BUCKET)
    are missing. The lifespan calls this at startup so misconfiguration
    crashes the app at boot rather than per-request.
    """
    global _client
    if _client is None:
        _client = build_storage_client(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            bucket=settings.minio_bucket,
            public_endpoint=settings.minio_public_endpoint,
            secure=settings.minio_secure,
        )
    return _client


def reset_client_cache() -> None:
    """Clear the cached storage client. Test-only helper."""
    global _client
    _client = None


__all__ = [
    "StorageClient",
    "StorageNotConfiguredError",
    "_DualEndpointStorageClient",
    "_parse_endpoint",
    "get_storage",
    "reset_client_cache",
]
