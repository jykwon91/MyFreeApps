"""Inject per-request presigned URLs into ListingBlackoutAttachmentResponse rows.

Single-seam rule: presigned URLs for any object in the blackout domain
are minted ONLY through this module. Each row is HEAD-checked via the
shared ``attach_presigned_url_with_head_check`` helper; missing objects
are flagged ``is_available=False`` so the UI can render a "File missing
— re-upload" affordance.
"""
from __future__ import annotations

from app.schemas.listings.listing_blackout_attachment_response import (
    ListingBlackoutAttachmentResponse,
)
from app.services.storage.presigned_url_attacher import (
    attach_presigned_url_with_head_check,
)


def attach_presigned_urls(
    attachments: list[ListingBlackoutAttachmentResponse],
) -> list[ListingBlackoutAttachmentResponse]:
    return attach_presigned_url_with_head_check(
        attachments,
        sentry_event_name="blackout_attachment_storage_object_missing",
    )
