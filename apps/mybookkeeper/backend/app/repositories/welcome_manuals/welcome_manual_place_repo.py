import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.welcome_manuals.welcome_manual_place import WelcomeManualPlace

# Columns mutable via PATCH. ``manual_id`` is immutable post-create — moving a
# place between manuals is not a supported flow.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "name",
    "cuisine",
    "price_tier",
    "note",
    "map_url",
    "display_order",
})


async def list_by_manual(
    db: AsyncSession,
    manual_id: uuid.UUID,
) -> list[WelcomeManualPlace]:
    """List places for a manual in display order (then by creation time)."""
    result = await db.execute(
        select(WelcomeManualPlace)
        .where(WelcomeManualPlace.manual_id == manual_id)
        .order_by(
            WelcomeManualPlace.display_order.asc(),
            WelcomeManualPlace.created_at.asc(),
        )
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    place_id: uuid.UUID,
    manual_id: uuid.UUID,
) -> WelcomeManualPlace | None:
    """Return the place iff it exists and belongs to the given manual."""
    result = await db.execute(
        select(WelcomeManualPlace).where(
            WelcomeManualPlace.id == place_id,
            WelcomeManualPlace.manual_id == manual_id,
        )
    )
    return result.scalar_one_or_none()


async def next_display_order(
    db: AsyncSession,
    manual_id: uuid.UUID,
) -> int:
    """Return the next display_order slot for a manual (max + 1, or 0 if empty)."""
    result = await db.execute(
        select(func.max(WelcomeManualPlace.display_order)).where(
            WelcomeManualPlace.manual_id == manual_id,
        )
    )
    current = result.scalar_one_or_none()
    return 0 if current is None else int(current) + 1


async def create(
    db: AsyncSession,
    *,
    manual_id: uuid.UUID,
    name: str,
    cuisine: str,
    price_tier: str | None,
    note: str | None,
    map_url: str | None,
    display_order: int,
) -> WelcomeManualPlace:
    place = WelcomeManualPlace(
        manual_id=manual_id,
        name=name,
        cuisine=cuisine,
        price_tier=price_tier,
        note=note,
        map_url=map_url,
        display_order=display_order,
    )
    db.add(place)
    await db.flush()
    return place


async def update(
    db: AsyncSession,
    place_id: uuid.UUID,
    manual_id: uuid.UUID,
    fields: dict[str, Any],
) -> WelcomeManualPlace | None:
    """Apply allowlisted updates to a place. None if it doesn't exist /
    belongs to a different manual."""
    place = await get_by_id(db, place_id, manual_id)
    if place is None:
        return None
    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return place
    for key, value in safe_fields.items():
        setattr(place, key, value)
    await db.flush()
    return place


async def delete_by_id(
    db: AsyncSession,
    place_id: uuid.UUID,
    manual_id: uuid.UUID,
) -> WelcomeManualPlace | None:
    """Delete a place and return the deleted row. None if no row matched."""
    place = await get_by_id(db, place_id, manual_id)
    if place is None:
        return None
    await db.execute(
        delete(WelcomeManualPlace).where(
            WelcomeManualPlace.id == place_id,
            WelcomeManualPlace.manual_id == manual_id,
        )
    )
    return place
