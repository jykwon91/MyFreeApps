import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.welcome_manuals.welcome_manual_room import WelcomeManualRoom

# Columns mutable via PATCH. ``manual_id`` is immutable post-create — moving a
# room between manuals is not a supported flow. ``display_order`` is set by
# create and by the dedicated reorder flow, never by a general update.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "name",
})


async def list_by_manual(
    db: AsyncSession,
    manual_id: uuid.UUID,
) -> list[WelcomeManualRoom]:
    """List a manual's rooms in display order (then by creation time)."""
    result = await db.execute(
        select(WelcomeManualRoom)
        .where(WelcomeManualRoom.manual_id == manual_id)
        .order_by(
            WelcomeManualRoom.display_order.asc(),
            WelcomeManualRoom.created_at.asc(),
        )
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    room_id: uuid.UUID,
    manual_id: uuid.UUID,
) -> WelcomeManualRoom | None:
    """Return the room iff it exists and belongs to the given manual."""
    result = await db.execute(
        select(WelcomeManualRoom).where(
            WelcomeManualRoom.id == room_id,
            WelcomeManualRoom.manual_id == manual_id,
        )
    )
    return result.scalar_one_or_none()


async def count_by_manual(db: AsyncSession, manual_id: uuid.UUID) -> int:
    """Number of rooms on a manual — used to enforce the per-manual cap."""
    result = await db.execute(
        select(func.count(WelcomeManualRoom.id)).where(
            WelcomeManualRoom.manual_id == manual_id,
        )
    )
    return int(result.scalar_one())


async def next_display_order(db: AsyncSession, manual_id: uuid.UUID) -> int:
    """Return the next display_order slot for a manual (max + 1, or 0 if empty)."""
    result = await db.execute(
        select(func.max(WelcomeManualRoom.display_order)).where(
            WelcomeManualRoom.manual_id == manual_id,
        )
    )
    current = result.scalar_one_or_none()
    return 0 if current is None else int(current) + 1


async def create(
    db: AsyncSession,
    *,
    manual_id: uuid.UUID,
    name: str,
    display_order: int,
) -> WelcomeManualRoom:
    room = WelcomeManualRoom(
        manual_id=manual_id,
        name=name,
        display_order=display_order,
    )
    db.add(room)
    await db.flush()
    return room


async def update(
    db: AsyncSession,
    room_id: uuid.UUID,
    manual_id: uuid.UUID,
    fields: dict[str, Any],
) -> WelcomeManualRoom | None:
    """Apply allowlisted updates to a room.

    Returns the refreshed room, or None if it doesn't exist / belongs to a
    different manual.
    """
    room = await get_by_id(db, room_id, manual_id)
    if room is None:
        return None
    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return room
    for key, value in safe_fields.items():
        setattr(room, key, value)
    await db.flush()
    return room


async def delete_by_id(
    db: AsyncSession,
    room_id: uuid.UUID,
    manual_id: uuid.UUID,
) -> WelcomeManualRoom | None:
    """Delete a room and return the deleted row. None if no match.

    Sections scoped to the room go with it via ``ON DELETE CASCADE`` — the
    caller is responsible for reaching their image storage keys first.
    """
    room = await get_by_id(db, room_id, manual_id)
    if room is None:
        return None
    await db.execute(
        delete(WelcomeManualRoom).where(
            WelcomeManualRoom.id == room_id,
            WelcomeManualRoom.manual_id == manual_id,
        )
    )
    return room
