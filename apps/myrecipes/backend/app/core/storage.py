"""MyRecipes storage client — thin wrapper over ``platform_shared.core.storage``.

Mirrors apps/myjobhunter/backend/app/core/storage.py (name swap only).
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
    """Return the cached MinIO storage client, building it if needed."""
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
