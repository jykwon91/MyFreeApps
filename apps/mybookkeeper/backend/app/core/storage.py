"""MinIO/S3 file storage client.

In production, MinIO runs alongside the app inside Docker Compose. The app
connects to MinIO over the docker-compose network (`minio:9000`) for puts,
gets, and deletes — never over the public internet — but presigned read URLs
must be signed against the *public* hostname so the user's browser can fetch
the object directly. The `_DualEndpointStorageClient` keeps these two
endpoints distinct.

Storage is a HARD REQUIREMENT. Listing photos, lease attachments, and
applicant documents all depend on it. ``get_storage()`` raises
``StorageNotConfiguredError`` on missing env vars; the FastAPI lifespan
verifies bucket reachability at startup and refuses to boot on failure.
Per-request paths therefore never see ``None`` — silent degradation
(``presigned_url=None`` placeholders) is gone. See the
PR #201–#204 postmortem for the bug trail this pattern caused.
"""
import io
import logging
import uuid
from datetime import timedelta
from typing import Any
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: "StorageClient | None" = None


class StorageNotConfiguredError(RuntimeError):
    """Raised when MinIO env vars are missing or incomplete.

    Distinct from a transient outage: this is a *deployment-time* fault
    that should crash the app at boot, not a per-request degradation.
    """


def _parse_endpoint(url: str) -> tuple[str, bool]:
    """Strip scheme from a URL and return (host[:port], secure_flag).

    The `minio` Python client expects host:port — not a full URL — and a
    separate `secure=True/False` toggle to choose http vs https.
    """
    if "://" in url:
        parsed = urlparse(url)
        secure = parsed.scheme == "https"
        host = parsed.netloc or parsed.path
        return host, secure
    return url, False


class StorageClient:
    """Single-endpoint storage client.

    Used when no separate public endpoint is configured (local dev / tests).
    """

    def __init__(self, client: Minio, bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    @property
    def bucket(self) -> str:
        return self._bucket

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

    def head_object(self, key: str) -> dict[str, Any] | None:
        """Return object metadata, or None if the object does not exist."""
        try:
            stat = self._client.stat_object(self._bucket, key)
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchObject"}:
                return None
            logger.warning("head_object failed for %s", key, exc_info=True)
            return None
        return {
            "size": stat.size,
            "etag": stat.etag,
            "content_type": stat.content_type,
            "last_modified": stat.last_modified,
        }

    def object_exists(self, key: str) -> bool:
        """Whether the object exists. ``False`` only on NoSuchKey.

        Distinct from ``head_object``: this re-raises transient S3 errors
        (network blip, signature mismatch, server 5xx) so the caller sees
        a real exception instead of confusing a service outage with a
        missing object. Used by per-request response builders to flag
        orphan attachment rows whose underlying file is gone — see
        ``services/leases/attachment_response_builder.py``.
        """
        try:
            self._client.stat_object(self._bucket, key)
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchObject"}:
                return False
            raise
        return True

    def generate_presigned_url(
        self,
        key: str,
        expires_in_seconds: int,
        *,
        response_content_disposition: str | None = None,
    ) -> str:
        """Sign a GET URL for `key` valid for `expires_in_seconds`.

        The URL points at whatever endpoint this client was constructed
        with — for `_DualEndpointStorageClient` the inner public client is
        used so the browser can reach it.

        When ``response_content_disposition`` is set (e.g. ``'attachment;
        filename="Lease Agreement - tenant signed.pdf"'``), the value is
        signed into the URL via the ``response-content-disposition``
        S3 query parameter so MinIO emits it as a response header on the
        GET. Browsers honor this for filename selection on download.
        """
        return self._client.presigned_get_object(
            self._bucket,
            key,
            expires=timedelta(seconds=expires_in_seconds),
            response_headers=(
                {"response-content-disposition": response_content_disposition}
                if response_content_disposition
                else None
            ),
        )

    def ensure_bucket(self) -> None:
        """Create the bucket if it doesn't exist. Idempotent."""
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

    @staticmethod
    def generate_key(org_id: str, filename: str) -> str:
        return f"{org_id}/{uuid.uuid4()}/{filename}"


class _DualEndpointStorageClient(StorageClient):
    """Storage client where read/write traffic and presigned-URL signing
    target different endpoints.

    The inner `Minio` client (passed to `__init__`) handles puts/gets/deletes
    over the internal docker network. A second `Minio` client constructed
    against the *public* endpoint signs presigned URLs that the browser can
    follow. Object key, bucket, and credentials are identical on both sides —
    only the host differs.
    """

    def __init__(
        self,
        internal_client: Minio,
        public_client: Minio,
        bucket: str,
    ) -> None:
        super().__init__(internal_client, bucket)
        self._public_client = public_client

    def generate_presigned_url(
        self,
        key: str,
        expires_in_seconds: int,
        *,
        response_content_disposition: str | None = None,
    ) -> str:
        return self._public_client.presigned_get_object(
            self._bucket,
            key,
            expires=timedelta(seconds=expires_in_seconds),
            response_headers=(
                {"response-content-disposition": response_content_disposition}
                if response_content_disposition
                else None
            ),
        )


def _build_client(host: str, secure: bool) -> Minio:
    # Pin region to "us-east-1" so the minio-py client never calls
    # GetBucketLocation to discover it. Without this, presign triggers
    # a network round-trip to the *public* endpoint just to read the
    # region — which (a) is slow even when reachable, (b) hangs forever
    # if the public endpoint's TLS is misconfigured (we hit this in
    # prod: `TLSV1_ALERT_INTERNAL_ERROR` from storage.<domain>). The
    # region value is only used in the SigV4 string-to-sign; MinIO
    # accepts any value here, the default is "us-east-1".
    return Minio(
        host,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=secure,
        region="us-east-1",
    )


def get_storage() -> StorageClient:
    """Return the MinIO storage client.

    Raises ``StorageNotConfiguredError`` if the required env vars
    (MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_BUCKET)
    are missing. The lifespan calls this at startup so misconfiguration
    crashes the app at boot rather than per-request.

    When `minio_public_endpoint` is set and differs from `minio_endpoint`,
    a `_DualEndpointStorageClient` is returned so presigned URLs are signed
    against the public endpoint while puts/gets/deletes go through the
    internal one.
    """
    global _client
    missing = [
        name for name, value in (
            ("MINIO_ENDPOINT", settings.minio_endpoint),
            ("MINIO_ACCESS_KEY", settings.minio_access_key),
            ("MINIO_SECRET_KEY", settings.minio_secret_key),
            ("MINIO_BUCKET", settings.minio_bucket),
        ) if not value
    ]
    if missing:
        raise StorageNotConfiguredError(
            f"MinIO storage is required but the following env vars are unset: {', '.join(missing)}",
        )
    if _client is not None:
        return _client

    internal_host, internal_secure = _parse_endpoint(settings.minio_endpoint)
    internal_client = _build_client(internal_host, internal_secure or settings.minio_secure)

    public_endpoint = settings.minio_public_endpoint.strip()
    if public_endpoint and public_endpoint != settings.minio_endpoint:
        public_host, public_secure = _parse_endpoint(public_endpoint)
        public_client = _build_client(public_host, public_secure)
        client: StorageClient = _DualEndpointStorageClient(
            internal_client, public_client, settings.minio_bucket,
        )
    else:
        client = StorageClient(internal_client, settings.minio_bucket)

    # Bucket existence is verified by the FastAPI lifespan
    # (services/storage/bucket_initializer.py). Calling ensure_bucket()
    # here would re-trigger a network round-trip on every cold-cache
    # invocation — when MinIO is unreachable, bucket_exists() hangs for
    # tens of seconds, blocking any request that touches attachments.
    # Presigning is purely cryptographic (HMAC over the URL) and does
    # not require the bucket to exist or MinIO to be reachable; the
    # browser-side fetch is what tests connectivity.
    _client = client
    return _client


def reset_client_cache() -> None:
    """Clear the cached storage client. Test-only helper."""
    global _client
    _client = None


__all__ = [
    "StorageClient",
    "get_storage",
    "reset_client_cache",
]
