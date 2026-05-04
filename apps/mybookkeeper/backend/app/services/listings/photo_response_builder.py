"""Inject per-request presigned URLs into `ListingPhotoResponse` rows.

Photos in the listings UI are served via short-lived presigned URLs rather
than a public bucket so that:
- The bucket can stay private (no anonymous reads).
- URLs expire automatically (1-hour TTL by default).
- Object keys are never directly exposed to the public DNS.

This module is the single seam where presigned URLs are minted on read paths.
Centralising it here keeps `core/storage.py` a pure transport layer (no
schema awareness).

Storage is a hard requirement (the lifespan refuses to boot if MinIO is
unreachable). Per-request signing is purely cryptographic and any
exception bubbles up so the request returns 500 with a real stack
trace. Silent ``presigned_url=None`` placeholders are no longer
permitted on this path — see PR #201–#204 postmortem.
"""
from __future__ import annotations

from app.core.config import settings
from app.core.storage import StorageClient, get_storage
from app.schemas.listings.listing_photo_response import ListingPhotoResponse


def _sign_one(storage: StorageClient, key: str) -> str:
    return storage.generate_presigned_url(key, settings.presigned_url_ttl_seconds)


def attach_presigned_urls(
    photos: list[ListingPhotoResponse],
) -> list[ListingPhotoResponse]:
    """Return the same photos with `presigned_url` populated."""
    if not photos:
        return photos
    storage = get_storage()
    return [
        p.model_copy(update={"presigned_url": _sign_one(storage, p.storage_key)})
        for p in photos
    ]
