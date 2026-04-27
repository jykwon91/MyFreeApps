"""Listing-photo upload pipeline.

Per RENTALS_PLAN.md §8.6, every photo flows through:

    size check → content-type sniff → allowlist → image_processor (EXIF strip)
        → storage put → repo insert

The route handler is a thin shell over this orchestration. Storage
interactions go through `core/storage.py:get_storage()` so test environments
without MinIO configured can still exercise the full pipeline (see
`StorageClient` for the in-memory fallback).
"""
import logging
import uuid
from typing import Any

from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories import listing_photo_repo, listing_repo
from app.schemas.listings.listing_photo_response import ListingPhotoResponse
from app.services.listings.photo_response_builder import attach_presigned_urls
from app.services.storage.image_processor import ImageRejected, process_image

logger = logging.getLogger(__name__)


class ListingNotFoundError(LookupError):
    """Raised when the listing the caller scoped against does not exist."""


class StorageNotConfiguredError(RuntimeError):
    """Raised when MinIO/S3 storage is not configured.

    Photo uploads require object storage — unlike documents which can fall back
    to DB-side storage, photos are too large for that and benefit from CDN
    fronting. Surfaces as HTTP 503.
    """


async def upload_photos(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    listing_id: uuid.UUID,
    files: list[tuple[bytes, str | None, str | None]],
) -> list[ListingPhotoResponse]:
    """Validate and persist a batch of photo uploads.

    Args:
        organization_id: scope guard.
        listing_id: the listing the photos attach to.
        files: list of `(content, filename, declared_content_type)` tuples
            from the multipart request. The processor sniffs the real content
            type — `declared_content_type` is logged for diagnostics only.

    Raises:
        ListingNotFoundError: listing missing, soft-deleted, or out of org.
        StorageNotConfiguredError: object storage unavailable.
        ImageRejected: any file fails size / format / decode validation. The
            transaction is aborted — partial uploads are NOT committed.
    """
    if not files:
        return []

    storage = get_storage()
    if storage is None:
        raise StorageNotConfiguredError("Object storage is not configured")

    # Pre-validate every file before touching storage so a single bad file
    # doesn't leave half a batch persisted.
    processed: list[tuple[bytes, str, str]] = []
    for content, filename, declared in files:
        result = process_image(content, declared_content_type=declared)
        # filename can be empty (some clients send no filename); generate one
        # from the sniffed content type so the storage key is stable.
        safe_name = filename or f"photo-{uuid.uuid4().hex}"
        processed.append((result.content, result.content_type, safe_name))

    async with unit_of_work() as db:
        listing = await listing_repo.get_by_id(db, listing_id, organization_id)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")

        next_order = await listing_photo_repo.next_display_order(db, listing.id)
        created_rows: list[Any] = []

        for index, (clean_bytes, content_type, safe_name) in enumerate(processed):
            storage_key = storage.generate_key(str(organization_id), safe_name)
            # Upload to object storage BEFORE the DB insert so a storage
            # failure rolls back the transaction cleanly. If the DB insert
            # fails after a successful upload, the orphan object is logged
            # for the next sweep cycle (out of scope for v1).
            storage.upload_file(storage_key, clean_bytes, content_type)
            try:
                photo = await listing_photo_repo.create(
                    db,
                    listing_id=listing.id,
                    storage_key=storage_key,
                    caption=None,
                    display_order=next_order + index,
                )
            except Exception:
                # Best-effort cleanup of the just-uploaded object so we don't
                # leak storage on partial failures.
                try:
                    storage.delete_file(storage_key)
                except Exception:  # noqa: BLE001
                    logger.warning(
                        "Failed to delete orphan photo %s after DB error",
                        storage_key,
                        exc_info=True,
                    )
                raise
            created_rows.append(photo)

        responses = [ListingPhotoResponse.model_validate(p) for p in created_rows]
        return attach_presigned_urls(responses)


async def update_photo(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    listing_id: uuid.UUID,
    photo_id: uuid.UUID,
    fields: dict[str, Any],
) -> ListingPhotoResponse:
    """Update a photo's caption and/or display_order.

    Raises ListingNotFoundError when the listing or photo can't be reached.
    """
    async with unit_of_work() as db:
        listing = await listing_repo.get_by_id(db, listing_id, organization_id)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")
        photo = await listing_photo_repo.update(db, photo_id, listing.id, fields)
        if photo is None:
            raise ListingNotFoundError(f"Photo {photo_id} not found")
        response = ListingPhotoResponse.model_validate(photo)
        return attach_presigned_urls([response])[0]


async def delete_photo(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    listing_id: uuid.UUID,
    photo_id: uuid.UUID,
) -> None:
    """Delete a photo from both DB and object storage.

    Raises ListingNotFoundError when the listing or photo can't be reached.
    """
    async with unit_of_work() as db:
        listing = await listing_repo.get_by_id(db, listing_id, organization_id)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")
        deleted = await listing_photo_repo.delete_by_id(db, photo_id, listing.id)
        if deleted is None:
            raise ListingNotFoundError(f"Photo {photo_id} not found")
        storage_key = deleted.storage_key

    # Storage cleanup outside the unit_of_work — if it fails the DB row is
    # already gone (intentional: the user expects the photo to be removed
    # from the listing immediately, and orphaned objects can be swept later).
    storage = get_storage()
    if storage is not None:
        try:
            storage.delete_file(storage_key)
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to delete photo object %s from storage", storage_key,
                exc_info=True,
            )
