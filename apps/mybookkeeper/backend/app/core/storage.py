"""MinIO/S3 file storage client — optional, falls back to database storage."""
import io
import logging
import uuid

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: "StorageClient | None" = None


class StorageClient:
    def __init__(self, client: Minio, bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    def upload_file(self, key: str, content: bytes, content_type: str) -> str:
        self._client.put_object(
            self._bucket,
            key,
            io.BytesIO(content),
            length=len(content),
            content_type=content_type,
        )
        return key

    def download_file(self, key: str) -> bytes:
        response = self._client.get_object(self._bucket, key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def delete_file(self, key: str) -> None:
        try:
            self._client.remove_object(self._bucket, key)
        except S3Error:
            logger.warning("Failed to delete object %s from MinIO", key, exc_info=True)

    @staticmethod
    def generate_key(org_id: str, filename: str) -> str:
        return f"{org_id}/{uuid.uuid4()}/{filename}"


def _is_configured() -> bool:
    return bool(settings.minio_endpoint and settings.minio_access_key and settings.minio_secret_key)


def get_storage() -> StorageClient | None:
    """Return the MinIO storage client, or None if not configured."""
    global _client
    if not _is_configured():
        return None
    if _client is not None:
        return _client
    minio_client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    if not minio_client.bucket_exists(settings.minio_bucket):
        minio_client.make_bucket(settings.minio_bucket)
    _client = StorageClient(minio_client, settings.minio_bucket)
    return _client
