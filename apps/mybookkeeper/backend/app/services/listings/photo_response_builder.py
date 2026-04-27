"""Inject per-request presigned URLs into `ListingPhotoResponse` rows.

Photos in the listings UI are served via short-lived presigned URLs rather
than a public bucket so that:
- The bucket can stay private (no anonymous reads).
- URLs expire automatically (1-hour TTL by default).
- Object keys are never directly exposed to the public DNS.

This module is the single seam where presigned URLs are minted on read paths.
Centralising it here keeps `core/storage.py` a pure transport layer (no
schema awareness) and avoids each call site re-implementing the
graceful-degradation fallback.

Graceful degradation: if storage is not configured (local dev without MinIO,
broken connection, etc.) the response is still returned with
`presigned_url=None`. The frontend treats `None` as "no URL available, render
a placeholder" — listing reads must never crash on a storage outage.
"""
from __future__ import annotations

import logging

from app.core.config import settings
from app.core.storage import StorageClient, get_storage
from app.schemas.listings.listing_photo_response import ListingPhotoResponse

logger = logging.getLogger(__name__)


def _sign_one(storage: StorageClient, key: str) -> str | None:
    """Sign a single key. Returns None on failure so a single broken object
    doesn't poison the entire listing response."""
    try:
        return storage.generate_presigned_url(key, settings.presigned_url_ttl_seconds)
    except Exception:  # noqa: BLE001 — defensive; storage transport errors must degrade gracefully
        logger.warning("Failed to sign presigned URL for %s", key, exc_info=True)
        return None


def attach_presigned_urls(
    photos: list[ListingPhotoResponse],
) -> list[ListingPhotoResponse]:
    """Return the same photos with `presigned_url` populated.

    Mutates a copy — input list is not modified. When storage is unavailable,
    every photo gets `presigned_url=None`.
    """
    if not photos:
        return photos

    storage = get_storage()
    if storage is None:
        return [p.model_copy(update={"presigned_url": None}) for p in photos]

    return [
        p.model_copy(update={"presigned_url": _sign_one(storage, p.storage_key)})
        for p in photos
    ]
