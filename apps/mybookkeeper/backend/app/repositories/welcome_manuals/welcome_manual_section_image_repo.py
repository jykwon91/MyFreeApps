import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.welcome_manuals.welcome_manual_section_image import (
    WelcomeManualSectionImage,
)

# Columns mutable via PATCH. ``section_id`` and ``storage_key`` are immutable
# post-create — moving an image between sections or rewriting its key is not a
# supported flow.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "caption",
    "display_order",
})


async def list_by_section(
    db: AsyncSession,
    section_id: uuid.UUID,
) -> list[WelcomeManualSectionImage]:
    """List images for a section in display order (then by creation time)."""
    result = await db.execute(
        select(WelcomeManualSectionImage)
        .where(WelcomeManualSectionImage.section_id == section_id)
        .order_by(
            WelcomeManualSectionImage.display_order.asc(),
            WelcomeManualSectionImage.created_at.asc(),
        )
    )
    return list(result.scalars().all())


async def list_by_section_ids(
    db: AsyncSession,
    section_ids: list[uuid.UUID],
) -> list[WelcomeManualSectionImage]:
    """List images for many sections in one query (ordered).

    Used when building a full manual response so the per-section image load
    is a single round trip rather than an N+1. Caller groups by section_id.
    """
    if not section_ids:
        return []
    result = await db.execute(
        select(WelcomeManualSectionImage)
        .where(WelcomeManualSectionImage.section_id.in_(section_ids))
        .order_by(
            WelcomeManualSectionImage.display_order.asc(),
            WelcomeManualSectionImage.created_at.asc(),
        )
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    image_id: uuid.UUID,
    section_id: uuid.UUID,
) -> WelcomeManualSectionImage | None:
    """Return the image iff it exists and belongs to the given section."""
    result = await db.execute(
        select(WelcomeManualSectionImage).where(
            WelcomeManualSectionImage.id == image_id,
            WelcomeManualSectionImage.section_id == section_id,
        )
    )
    return result.scalar_one_or_none()


async def next_display_order(
    db: AsyncSession,
    section_id: uuid.UUID,
) -> int:
    """Return the next display_order slot for a section (max + 1, or 0 if empty)."""
    result = await db.execute(
        select(func.max(WelcomeManualSectionImage.display_order)).where(
            WelcomeManualSectionImage.section_id == section_id,
        )
    )
    current = result.scalar_one_or_none()
    return 0 if current is None else int(current) + 1


async def create(
    db: AsyncSession,
    *,
    section_id: uuid.UUID,
    storage_key: str,
    caption: str | None,
    display_order: int,
) -> WelcomeManualSectionImage:
    image = WelcomeManualSectionImage(
        section_id=section_id,
        storage_key=storage_key,
        caption=caption,
        display_order=display_order,
    )
    db.add(image)
    await db.flush()
    return image


async def update(
    db: AsyncSession,
    image_id: uuid.UUID,
    section_id: uuid.UUID,
    fields: dict[str, Any],
) -> WelcomeManualSectionImage | None:
    """Apply allowlisted updates to an image. None if it doesn't exist /
    belongs to a different section."""
    image = await get_by_id(db, image_id, section_id)
    if image is None:
        return None
    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return image
    for key, value in safe_fields.items():
        setattr(image, key, value)
    await db.flush()
    return image


async def delete_by_id(
    db: AsyncSession,
    image_id: uuid.UUID,
    section_id: uuid.UUID,
) -> WelcomeManualSectionImage | None:
    """Delete an image and return the deleted row (so the caller can reach the
    storage_key for object-store cleanup). None if no row matched."""
    image = await get_by_id(db, image_id, section_id)
    if image is None:
        return None
    await db.execute(
        delete(WelcomeManualSectionImage).where(
            WelcomeManualSectionImage.id == image_id,
            WelcomeManualSectionImage.section_id == section_id,
        )
    )
    return image
