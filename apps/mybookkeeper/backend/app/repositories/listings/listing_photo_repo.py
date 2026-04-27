import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing_photo import ListingPhoto

# Allowlist of columns mutable via PATCH /listings/{id}/photos/{photo_id}.
# `listing_id` and `storage_key` are immutable post-create — moving a photo
# between listings or rewriting its storage key is not a supported flow.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "caption",
    "display_order",
})


async def list_by_listing(
    db: AsyncSession,
    listing_id: uuid.UUID,
) -> list[ListingPhoto]:
    """List photos for a listing in display order (then by creation time)."""
    result = await db.execute(
        select(ListingPhoto)
        .where(ListingPhoto.listing_id == listing_id)
        .order_by(ListingPhoto.display_order.asc(), ListingPhoto.created_at.asc())
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    photo_id: uuid.UUID,
    listing_id: uuid.UUID,
) -> ListingPhoto | None:
    """Return the photo iff it exists and belongs to the given listing."""
    result = await db.execute(
        select(ListingPhoto).where(
            ListingPhoto.id == photo_id,
            ListingPhoto.listing_id == listing_id,
        )
    )
    return result.scalar_one_or_none()


async def next_display_order(
    db: AsyncSession,
    listing_id: uuid.UUID,
) -> int:
    """Return the next display_order slot for a listing.

    Computed as `max(display_order) + 1` for existing photos; 0 when the
    listing has no photos yet. The caller is expected to be inside the same
    transaction as the subsequent insert; under concurrent uploads two
    callers may briefly see the same value, but display_order is not a
    uniqueness constraint and the user can drag-reorder if collisions occur.
    """
    result = await db.execute(
        select(func.max(ListingPhoto.display_order)).where(
            ListingPhoto.listing_id == listing_id,
        )
    )
    current = result.scalar_one_or_none()
    return 0 if current is None else int(current) + 1


async def create(
    db: AsyncSession,
    *,
    listing_id: uuid.UUID,
    storage_key: str,
    caption: str | None,
    display_order: int,
) -> ListingPhoto:
    photo = ListingPhoto(
        listing_id=listing_id,
        storage_key=storage_key,
        caption=caption,
        display_order=display_order,
    )
    db.add(photo)
    await db.flush()
    return photo


async def update(
    db: AsyncSession,
    photo_id: uuid.UUID,
    listing_id: uuid.UUID,
    fields: dict[str, Any],
) -> ListingPhoto | None:
    """Apply allowlisted updates to a photo.

    Returns the refreshed photo, or None if the photo doesn't exist / belongs
    to a different listing.
    """
    photo = await get_by_id(db, photo_id, listing_id)
    if photo is None:
        return None
    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return photo
    for key, value in safe_fields.items():
        setattr(photo, key, value)
    await db.flush()
    return photo


async def delete_by_id(
    db: AsyncSession,
    photo_id: uuid.UUID,
    listing_id: uuid.UUID,
) -> ListingPhoto | None:
    """Delete a photo and return the deleted row (so the caller can reach
    the storage_key for object-store cleanup). Returns None if no row matched."""
    photo = await get_by_id(db, photo_id, listing_id)
    if photo is None:
        return None
    await db.execute(
        delete(ListingPhoto).where(
            ListingPhoto.id == photo_id,
            ListingPhoto.listing_id == listing_id,
        )
    )
    return photo
