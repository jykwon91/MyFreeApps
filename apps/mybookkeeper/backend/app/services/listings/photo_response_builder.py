"""Inject per-request presigned URLs into ``ListingPhotoResponse`` rows.

Photos in the listings UI are served via short-lived presigned URLs rather
than a public bucket so that:
- The bucket can stay private (no anonymous reads).
- URLs expire automatically (1-hour TTL by default).
- Object keys are never directly exposed to the public DNS.

Single-seam rule: presigned URLs for any photo are minted ONLY through
this module. Each row is HEAD-checked via the shared
``attach_presigned_url_with_head_check`` helper; missing objects are
flagged ``is_available=False`` so the UI can render a placeholder
instead of a broken image tag.
"""
from __future__ import annotations

from app.schemas.listings.listing_photo_response import ListingPhotoResponse
from app.services.storage.presigned_url_attacher import (
    attach_presigned_url_with_head_check,
)


def attach_presigned_urls(
    photos: list[ListingPhotoResponse],
) -> list[ListingPhotoResponse]:
    return attach_presigned_url_with_head_check(
        photos,
        sentry_event_name="listing_photo_storage_object_missing",
    )
