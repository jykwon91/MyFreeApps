"""Map service — minimap upload + sign-on-read.

The lineup_service already does both for lineup screenshots; this module is
the map-domain equivalent. Storage of minimaps follows the same convention:

  - `Map.minimap_url` may hold one of three URL-shapes:
      1. A relative path (e.g. `/minimaps/cs2/mirage.png`) — bundled asset
         under `frontend/public/minimaps/`. Passed through to the client
         unchanged so the SPA serves it directly.
      2. An absolute URL (e.g. `https://...`) — pre-existing data or future
         CDN-hosted assets. Also passed through unchanged.
      3. A MinIO object key (e.g. `maps/<map_id>/minimap.png`) — operator
         uploaded via this service. The read path signs a presigned GET URL.

  - Object keys are stable per map (`maps/<map_id>/minimap.png`); re-uploads
    overwrite. Presigned URLs naturally cache-bust on every read because the
    signature query params change per call.
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Optional

from app.core.storage import get_storage

# Mirrors lineup_service: 15-minute PUT TTL, 24-hour GET TTL.
_UPLOAD_URL_TTL = timedelta(minutes=15)
_READ_URL_TTL = 24 * 3600  # seconds

# 5 MB cap on uploaded minimaps. CS2 radars from pak01_dir.vpk are well under
# this; valorant minimaps from valorant-api.com are also small. Anything
# bigger is almost certainly the wrong asset.
MAX_MINIMAP_BYTES = 5 * 1024 * 1024

# Allowed image content-types (also enforced by content-sniff after upload).
_ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


def minimap_object_key(map_id: uuid.UUID) -> str:
    """Build the canonical MinIO object key for a map's minimap.

    Stable per map — re-uploads overwrite. Path-prefixed to keep maps/
    grouped under one MinIO key prefix, separate from lineup screenshots.
    """
    return f"maps/{map_id}/minimap.png"


def generate_minimap_upload_url(map_id: uuid.UUID) -> tuple[str, str]:
    """Return (presigned_put_url, object_key) for a minimap upload.

    Caller flow:
      1. POST /api/maps/{map_id}/minimap-upload-url → this function
      2. Client PUT to put_url with the file body
      3. POST /api/maps/{map_id}/minimap → confirm_minimap_upload
    """
    storage = get_storage()
    key = minimap_object_key(map_id)
    put_url = _presigned_put(storage, key)
    return put_url, key


def confirm_minimap_upload(map_id: uuid.UUID, object_key: str) -> None:
    """Validate the uploaded object before persisting the key as minimap_url.

    Validates:
      - object_key matches the canonical key for this map (caller cannot
        repoint Map.minimap_url at an arbitrary MinIO object).
      - object exists in MinIO (the PUT actually happened).
      - object size <= MAX_MINIMAP_BYTES.
      - object content-type is an allowed image MIME.

    Raises ``ValueError`` on any validation failure. Caller is responsible
    for catching this and converting to an HTTP 422.
    """
    expected = minimap_object_key(map_id)
    if object_key != expected:
        raise ValueError(
            f"object_key {object_key!r} does not match expected {expected!r} "
            "for this map; refusing to update minimap_url."
        )

    storage = get_storage()
    info = _stat_object(storage, object_key)
    if info is None:
        raise ValueError(
            "no object found at the expected key — was the PUT completed?"
        )

    size = info.get("size", 0)
    if size > MAX_MINIMAP_BYTES:
        raise ValueError(
            f"minimap is {size} bytes; limit is {MAX_MINIMAP_BYTES} bytes "
            f"({MAX_MINIMAP_BYTES // 1024 // 1024} MB)."
        )

    content_type = (info.get("content_type") or "").lower()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise ValueError(
            f"content-type {content_type!r} not allowed; "
            f"expected one of: {sorted(_ALLOWED_CONTENT_TYPES)}."
        )


def sign_minimap_url(url: Optional[str]) -> Optional[str]:
    """Resolve a stored ``Map.minimap_url`` value to a client-usable URL.

    Pass-through for None, paths (``/...``), and absolute URLs. MinIO object
    keys (no leading slash, no protocol) get signed into a presigned GET URL.
    """
    if not url:
        return None
    if url.startswith("/") or url.startswith("http://") or url.startswith("https://"):
        return url
    storage = get_storage()
    return storage.generate_presigned_url(url, expires_in_seconds=_READ_URL_TTL)


# ---------------------------------------------------------------------------
# Internal helpers — mirror lineup_service._presigned_put / _stat_object
# ---------------------------------------------------------------------------

def _presigned_put(storage, key: str) -> str:
    """Sign a PUT URL using the public MinIO client when available.

    Same logic as ``lineup_service._presigned_put`` — split into a private
    helper so future bucket / endpoint changes only need updating in one
    place (kept inline rather than imported to keep service modules
    independently movable).
    """
    from platform_shared.core.storage import _DualEndpointStorageClient

    if isinstance(storage, _DualEndpointStorageClient):
        return storage._public_client.presigned_put_object(
            storage.bucket, key, expires=_UPLOAD_URL_TTL
        )
    return storage._client.presigned_put_object(
        storage.bucket, key, expires=_UPLOAD_URL_TTL
    )


def _stat_object(storage, key: str) -> Optional[dict]:
    """Return {size, content_type} for a MinIO object, or None on miss.

    minio-py's stat_object raises ``S3Error`` with code NoSuchKey on miss.
    """
    from minio.error import S3Error
    from platform_shared.core.storage import _DualEndpointStorageClient

    client = (
        storage._client
        if not isinstance(storage, _DualEndpointStorageClient)
        else storage._client
    )
    try:
        stat = client.stat_object(storage.bucket, key)
    except S3Error as exc:
        if exc.code == "NoSuchKey":
            return None
        raise
    return {
        "size": stat.size,
        "content_type": stat.content_type,
    }
