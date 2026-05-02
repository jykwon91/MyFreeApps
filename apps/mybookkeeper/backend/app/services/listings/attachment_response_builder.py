"""Inject per-request presigned URLs into ListingBlackoutAttachmentResponse rows.

Mirrors `photo_response_builder.py` but for blackout attachments. The single-
seam rule applies here too: presigned URLs for blackout attachments are minted
ONLY through this module.

Graceful degradation: if storage is not configured, responses are still
returned with ``presigned_url=None``. The frontend must render a placeholder
in that case rather than crash.
"""
from __future__ import annotations

import logging

from app.core.config import settings
from app.core.storage import StorageClient, get_storage
from app.schemas.listings.listing_blackout_attachment_response import (
    ListingBlackoutAttachmentResponse,
)

logger = logging.getLogger(__name__)


def _sign_one(storage: StorageClient, key: str) -> str | None:
    """Sign a single key. Returns None on failure."""
    try:
        return storage.generate_presigned_url(key, settings.presigned_url_ttl_seconds)
    except Exception:  # noqa: BLE001
        logger.warning("Failed to sign presigned URL for %s", key, exc_info=True)
        return None


def attach_presigned_urls(
    attachments: list[ListingBlackoutAttachmentResponse],
) -> list[ListingBlackoutAttachmentResponse]:
    """Return the same attachments with ``presigned_url`` populated.

    When storage is unavailable, every attachment gets ``presigned_url=None``.
    """
    if not attachments:
        return attachments

    storage = get_storage()
    if storage is None:
        return [a.model_copy(update={"presigned_url": None}) for a in attachments]

    return [
        a.model_copy(update={"presigned_url": _sign_one(storage, a.storage_key)})
        for a in attachments
    ]
