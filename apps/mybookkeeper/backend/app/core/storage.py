from platform_shared.core.storage import StorageClient, StorageConfig, get_storage as _get_storage

from app.core.config import settings


def _build_config() -> StorageConfig | None:
    if not (settings.minio_endpoint and settings.minio_access_key and settings.minio_secret_key):
        return None
    return StorageConfig(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        bucket=settings.minio_bucket,
        secure=settings.minio_secure,
    )


def get_storage() -> StorageClient | None:
    return _get_storage(_build_config())
