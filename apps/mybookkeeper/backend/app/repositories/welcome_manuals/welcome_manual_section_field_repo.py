import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.welcome_manuals.welcome_manual_section_field import (
    WelcomeManualSectionField,
)

# Columns mutable via PATCH. ``section_id`` is immutable post-create — moving a
# field between sections is not a supported flow.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "label",
    "value",
    "display_order",
})


async def list_by_section(
    db: AsyncSession,
    section_id: uuid.UUID,
) -> list[WelcomeManualSectionField]:
    """List fields for a section in display order (then by creation time)."""
    result = await db.execute(
        select(WelcomeManualSectionField)
        .where(WelcomeManualSectionField.section_id == section_id)
        .order_by(
            WelcomeManualSectionField.display_order.asc(),
            WelcomeManualSectionField.created_at.asc(),
        )
    )
    return list(result.scalars().all())


async def list_by_section_ids(
    db: AsyncSession,
    section_ids: list[uuid.UUID],
) -> list[WelcomeManualSectionField]:
    """List fields for many sections in one query (ordered).

    Used when building a full manual response so the per-section field load is a
    single round trip rather than an N+1. Caller groups by section_id.
    """
    if not section_ids:
        return []
    result = await db.execute(
        select(WelcomeManualSectionField)
        .where(WelcomeManualSectionField.section_id.in_(section_ids))
        .order_by(
            WelcomeManualSectionField.display_order.asc(),
            WelcomeManualSectionField.created_at.asc(),
        )
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    field_id: uuid.UUID,
    section_id: uuid.UUID,
) -> WelcomeManualSectionField | None:
    """Return the field iff it exists and belongs to the given section."""
    result = await db.execute(
        select(WelcomeManualSectionField).where(
            WelcomeManualSectionField.id == field_id,
            WelcomeManualSectionField.section_id == section_id,
        )
    )
    return result.scalar_one_or_none()


async def next_display_order(
    db: AsyncSession,
    section_id: uuid.UUID,
) -> int:
    """Return the next display_order slot for a section (max + 1, or 0 if empty)."""
    result = await db.execute(
        select(func.max(WelcomeManualSectionField.display_order)).where(
            WelcomeManualSectionField.section_id == section_id,
        )
    )
    current = result.scalar_one_or_none()
    return 0 if current is None else int(current) + 1


async def create(
    db: AsyncSession,
    *,
    section_id: uuid.UUID,
    label: str,
    value: str | None,
    display_order: int,
) -> WelcomeManualSectionField:
    field = WelcomeManualSectionField(
        section_id=section_id,
        label=label,
        value=value,
        display_order=display_order,
    )
    db.add(field)
    await db.flush()
    return field


async def update(
    db: AsyncSession,
    field_id: uuid.UUID,
    section_id: uuid.UUID,
    fields: dict[str, Any],
) -> WelcomeManualSectionField | None:
    """Apply allowlisted updates to a field. None if it doesn't exist /
    belongs to a different section."""
    field = await get_by_id(db, field_id, section_id)
    if field is None:
        return None
    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return field
    for key, value in safe_fields.items():
        setattr(field, key, value)
    await db.flush()
    return field


async def delete_by_id(
    db: AsyncSession,
    field_id: uuid.UUID,
    section_id: uuid.UUID,
) -> WelcomeManualSectionField | None:
    """Delete a field and return the deleted row. None if no row matched."""
    field = await get_by_id(db, field_id, section_id)
    if field is None:
        return None
    await db.execute(
        delete(WelcomeManualSectionField).where(
            WelcomeManualSectionField.id == field_id,
            WelcomeManualSectionField.section_id == section_id,
        )
    )
    return field
