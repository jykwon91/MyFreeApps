"""MinIO/S3 file storage client — optional, falls back to database storage."""
import io
import logging
import uuid
from dataclasses import dataclass

from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)


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
    def generate_key(prefix: str, filename: str) -> str:
        return f"{prefix}/{uuid.uuid4()}/{filename}"


@dataclass
class StorageConfig:
    endpoint: str
    access_key: str
    secret_key: str
    bucket: str
    secure: bool = True


_client: StorageClient | None = None


def create_storage(config: StorageConfig) -> StorageClient:
    """Create and return a MinIO storage client."""
    minio_client = Minio(
        config.endpoint,
        access_key=config.access_key,
        secret_key=config.secret_key,
        secure=config.secure,
    )
    if not minio_client.bucket_exists(config.bucket):
        minio_client.make_bucket(config.bucket)
    return StorageClient(minio_client, config.bucket)


def get_storage(config: StorageConfig | None) -> StorageClient | None:
    """Return the MinIO storage client, or None if not configured."""
    global _client
    if config is None:
        return None
    if not (config.endpoint and config.access_key and config.secret_key):
        return None
    if _client is not None:
        return _client
    _client = create_storage(config)
    return _client
