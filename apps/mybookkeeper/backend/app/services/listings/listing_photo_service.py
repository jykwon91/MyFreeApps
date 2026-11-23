"""Listing-photo upload pipeline.

Per RENTALS_PLAN.md §8.6, every photo flows through:

    size check → content-type sniff → allowlist → image_processor (EXIF strip)
        → storage put → repo insert

The photos are stored before the transaction that records them, so the
listing lock is never held while they upload; ``CommittedWriteGuard``
removes them if the rows don't land.
"""
import asyncio
import uuid
from typing import Any

from platform_shared.core.storage import StorageNotConfiguredError  # noqa: F401 — re-exported for back-compat
from platform_shared.schemas.storage.new_stored_object import NewStoredObject
from platform_shared.services.storage.committed_write_guard import CommittedWriteGuard
from platform_shared.services.storage.object_upload import upload_objects
from platform_shared.services.storage.rows_present import RowsPresent
from platform_shared.services.storage.stored_object_cleanup import delete_stored_files

from app.core.commit_outcome_constants import OUTCOME_CHECK_LOCK_TIMEOUT_MS
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories import listing_photo_repo, listing_repo, lock_timeout_repo
from app.schemas.listings.listing_photo_response import ListingPhotoResponse
from app.services.listings.listing_not_found_error import ListingNotFoundError
from app.services.listings.photo_response_builder import attach_presigned_urls
from app.services.storage.image_processor import (
    filename_for_content_type,
    process_image,
)


class StalePhotoOrderError(ValueError):
    """Raised when a new photo order names a photo that isn't on the listing (the caller's list is stale)."""


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
        ImageRejected: any file fails size / format / decode validation.

    Any failure leaves no photo stored and no row written.
    """
    if not files:
        return []

    # Pre-validate every file before touching storage so a single bad file
    # doesn't leave half a batch persisted.
    processed: list[tuple[bytes, str, str]] = []
    for content, filename, declared in files:
        result = await asyncio.to_thread(process_image, content, declared_content_type=declared)
        # filename can be empty (some clients send no filename); generate one
        # from the sniffed content type so the storage key is stable.
        safe_name = filename_for_content_type(
            filename or f"photo-{uuid.uuid4().hex}", result.content_type,
        )
        processed.append((result.content, result.content_type, safe_name))

    # Refuse early, before anything is stored; checked again under the lock.
    async with unit_of_work() as db:
        if await listing_repo.get_by_id(db, listing_id, organization_id) is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")

    # The photos go to storage before the transaction, so the listing lock is
    # never held while they upload. A failure later removes them again.
    storage = get_storage()
    objects = [
        NewStoredObject(storage.generate_key(str(organization_id), safe_name), clean_bytes, content_type)
        for clean_bytes, content_type, safe_name in processed
    ]
    keys = [obj.key for obj in objects]
    await upload_objects(storage, objects)
    async with CommittedWriteGuard(
        storage, keys, _photos_present_check(organization_id, listing_id, keys),
    ) as guard:
        async with unit_of_work() as db:
            listing = await listing_repo.get_by_id(db, listing_id, organization_id, for_update=True)
            if listing is None:
                raise ListingNotFoundError(f"Listing {listing_id} not found")
            next_order = await listing_photo_repo.next_display_order(db, listing.id)
            responses = [
                ListingPhotoResponse.model_validate(await listing_photo_repo.create(
                    db,
                    listing_id=listing.id,
                    storage_key=key,
                    caption=None,
                    display_order=next_order + index,
                ))
                for index, key in enumerate(keys)
            ]
            guard.rows_written()
    return await attach_presigned_urls(responses)


def _photos_present_check(
    organization_id: uuid.UUID, listing_id: uuid.UUID, keys: list[str],
) -> RowsPresent:
    """Whether the listing has photos stored under ``keys``.

    Takes the listing lock first (bounded by a lock timeout), which waits for
    the original transaction to finish; a timeout or any error leaves the
    outcome unknown.
    """

    async def rows_present() -> bool:
        async with unit_of_work() as db:
            await lock_timeout_repo.set_local_lock_timeout(db, OUTCOME_CHECK_LOCK_TIMEOUT_MS)
            listing = await listing_repo.get_by_id(
                db, listing_id, organization_id, include_deleted=True, for_update=True,
            )
            if listing is None:
                return False
            photos = await listing_photo_repo.list_by_listing(db, listing.id)
        return bool({p.storage_key for p in photos} & set(keys))

    return rows_present


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
        listing = await listing_repo.get_by_id(db, listing_id, organization_id, for_update=True)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")
        photo = await listing_photo_repo.update(db, photo_id, listing.id, fields)
        if photo is None:
            raise ListingNotFoundError(f"Photo {photo_id} not found")
        response = ListingPhotoResponse.model_validate(photo)
    # URLs are minted after the commit, so the listing lock isn't held through
    # the storage checks.
    return (await attach_presigned_urls([response]))[0]


async def reorder_photos(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    listing_id: uuid.UUID,
    photo_ids: list[uuid.UUID],
) -> list[ListingPhotoResponse]:
    """Put the listing's photos in `photo_ids` order in one transaction.

    The listing row is locked first, so uploads, deletes and other reorders on
    it run one at a time. `photo_ids` must be an exact permutation of the
    listing's current photos. Raises ListingNotFoundError when the listing is
    missing, and StalePhotoOrderError when the list is partial or names an
    unknown or repeated id (the caller's list is out of date); nothing is
    changed in either case.
    """
    async with unit_of_work() as db:
        listing = await listing_repo.get_by_id(db, listing_id, organization_id, for_update=True)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")
        ordered = await listing_photo_repo.apply_order(db, listing.id, photo_ids)
        if ordered is None:
            raise StalePhotoOrderError("photo_ids must be a permutation of the listing's current photos")
        responses = [ListingPhotoResponse.model_validate(p) for p in ordered]
    return await attach_presigned_urls(responses)


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
        listing = await listing_repo.get_by_id(db, listing_id, organization_id, for_update=True)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")
        deleted = await listing_photo_repo.delete_by_id(db, photo_id, listing.id)
        if deleted is None:
            raise ListingNotFoundError(f"Photo {photo_id} not found")
        storage_key = deleted.storage_key

    # Storage cleanup outside the unit_of_work — if it fails the DB row is
    # already gone (intentional: the user expects the photo to be removed
    # from the listing immediately, and orphaned objects can be swept later).
    await delete_stored_files(get_storage(), [storage_key])
