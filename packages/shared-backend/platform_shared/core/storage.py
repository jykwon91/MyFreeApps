"""MinIO/S3 file storage client.

In production, MinIO runs alongside the app inside Docker Compose. The app
connects to MinIO over the docker-compose network (e.g. ``minio:9000``) for
puts, gets, and deletes — never over the public internet — but presigned
read URLs must be signed against the *public* hostname so the user's
browser can fetch the object directly. ``_DualEndpointStorageClient``
keeps these two endpoints distinct.

Storage is a HARD REQUIREMENT for any consuming app. ``build_storage_client``
raises ``StorageNotConfiguredError`` on missing config; the FastAPI lifespan
verifies bucket reachability at startup and refuses to boot on failure.
Per-request paths therefore never see ``None`` — silent degradation
(``presigned_url=None`` placeholders) is gone. See the MBK PR #201–#204
postmortem for the bug trail this pattern caused.

Apps thin-wrap this module with their own ``app/core/storage.py``:

    from platform_shared.core.storage import (
        StorageClient,
        StorageNotConfiguredError,
        build_storage_client,
    )
    from app.core.config import settings

    _client: StorageClient | None = None

    def get_storage() -> StorageClient:
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
"""
from __future__ import annotations

import io
import logging
import uuid
from datetime import timedelta
from typing import Any
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)


class StorageNotConfiguredError(RuntimeError):
    """Raised when MinIO/S3 storage is required but not configured.

    Distinct from a transient storage outage — this is a deploy-time
    config error. Endpoints that require storage should map this to a
    503 so the operator can distinguish a missing-config from a transient
    blip.

    Lives in ``platform_shared`` so both apps raise (and catch) the same
    class, instead of each app defining its own and pattern-matching on
    string content.
    """


def _parse_endpoint(url: str) -> tuple[str, bool]:
    """Strip scheme from a URL and return (host[:port], secure_flag).

    The ``minio`` Python client expects host:port — not a full URL — and
    a separate ``secure=True/False`` toggle to choose http vs https.
    """
    if "://" in url:
        parsed = urlparse(url)
        secure = parsed.scheme == "https"
        host = parsed.netloc or parsed.path
        return host, secure
    return url, False


def _build_minio_client(
    host: str,
    *,
    access_key: str,
    secret_key: str,
    secure: bool,
) -> Minio:
    """Build a ``minio.Minio`` instance with a pinned region.

    Pin region to ``"us-east-1"`` so the minio-py client never calls
    ``GetBucketLocation`` to discover it. Without this, presign triggers
    a network round-trip to the *public* endpoint just to read the
    region — which (a) is slow even when reachable, (b) hangs forever if
    the public endpoint's TLS is misconfigured (we hit this in prod:
    ``TLSV1_ALERT_INTERNAL_ERROR`` from storage.<domain>). The region
    value is only used in the SigV4 string-to-sign; MinIO accepts any
    value here.
    """
    return Minio(
        host,
        access_key=access_key,
        secret_key=secret_key,
        secure=secure,
        region="us-east-1",
    )


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
        except S3Error as exc:
            logger.warning(
                "MinIO delete_file failed: bucket=%s key=%s code=%s message=%s",
                self._bucket,
                key,
                exc.code,
                exc.message,
            )

    def head_object(self, key: str) -> dict[str, Any] | None:
        """Return object metadata, or ``None`` if the object does not exist."""
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
        orphan attachment rows whose underlying file is gone.
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
        """Sign a GET URL for ``key`` valid for ``expires_in_seconds``.

        The URL points at whatever endpoint this client was constructed
        with — for ``_DualEndpointStorageClient`` the inner public client
        is used so the browser can reach it.

        When ``response_content_disposition`` is set (e.g.
        ``'attachment; filename="Lease Agreement - tenant signed.pdf"'``),
        the value is signed into the URL via the
        ``response-content-disposition`` S3 query parameter so MinIO emits
        it as a response header on the GET. Browsers honor this for
        filename selection on download.
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
    def generate_key(prefix: str, filename: str) -> str:
        """Build a storage object key from a prefix + filename.

        Apps pass their own prefix conventions:
        - MBK passes ``str(organization_id)`` for tenant isolation
        - MJH passes a domain prefix like ``"resumes"`` or ``"applicants"``

        The UUID middle segment ensures uniqueness even if the same
        filename is uploaded twice.
        """
        return f"{prefix}/{uuid.uuid4()}/{filename}"


class _DualEndpointStorageClient(StorageClient):
    """Storage client where read/write traffic and presigned-URL signing
    target different endpoints.

    The inner ``Minio`` client (passed to ``__init__``) handles puts/gets/
    deletes over the internal docker network. A second ``Minio`` client
    constructed against the *public* endpoint signs presigned URLs that
    the browser can follow. Object key, bucket, and credentials are
    identical on both sides — only the host differs.
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


def build_storage_client(
    *,
    endpoint: str,
    access_key: str,
    secret_key: str,
    bucket: str,
    public_endpoint: str | None = None,
    secure: bool = False,
) -> StorageClient:
    """Build a fresh ``StorageClient`` (or ``_DualEndpointStorageClient``).

    Raises ``StorageNotConfiguredError`` if any of ``endpoint``,
    ``access_key``, ``secret_key``, or ``bucket`` is empty.

    When ``public_endpoint`` is set and differs from ``endpoint``, returns
    a ``_DualEndpointStorageClient`` so presigned URLs are signed against
    the public endpoint while puts/gets/deletes go through the internal
    one.

    Caching is the caller's responsibility — apps wrap this with a
    module-level singleton + ``reset_client_cache()`` test helper.

    Bucket existence is NOT verified here. The FastAPI lifespan calls
    ``ensure_bucket()`` at startup; verifying here would re-trigger a
    network round-trip on every cold-cache invocation. Presigning is
    purely cryptographic (HMAC over the URL) and does not require the
    bucket to exist or MinIO to be reachable.
    """
    # Use env-var names in the error so the operator gets a copy-pasteable
    # name to set on the VPS — "MINIO_ENDPOINT" rather than "endpoint".
    missing = [
        name for name, value in (
            ("MINIO_ENDPOINT", endpoint),
            ("MINIO_ACCESS_KEY", access_key),
            ("MINIO_SECRET_KEY", secret_key),
            ("MINIO_BUCKET", bucket),
        ) if not value
    ]
    if missing:
        raise StorageNotConfiguredError(
            "MinIO storage is required but the following env vars are unset: "
            + ", ".join(missing),
        )

    internal_host, internal_secure = _parse_endpoint(endpoint)
    internal_client = _build_minio_client(
        internal_host,
        access_key=access_key,
        secret_key=secret_key,
        secure=internal_secure or secure,
    )

    if public_endpoint and public_endpoint.strip() and public_endpoint != endpoint:
        public_host, public_secure = _parse_endpoint(public_endpoint.strip())
        public_client = _build_minio_client(
            public_host,
            access_key=access_key,
            secret_key=secret_key,
            secure=public_secure,
        )
        return _DualEndpointStorageClient(internal_client, public_client, bucket)

    return StorageClient(internal_client, bucket)


__all__ = [
    "StorageClient",
    "StorageNotConfiguredError",
    "build_storage_client",
    # Internal helpers re-exported for tests + per-app extensions:
    "_DualEndpointStorageClient",
    "_parse_endpoint",
    "_build_minio_client",
]
