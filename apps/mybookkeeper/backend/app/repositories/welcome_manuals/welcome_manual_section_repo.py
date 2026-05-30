import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.welcome_manuals.welcome_manual_section import WelcomeManualSection

# Columns mutable via PATCH. ``manual_id`` is immutable post-create — moving a
# section between manuals is not a supported flow. ``display_order`` is NOT here:
# it's only reassigned by the dedicated reorder flow, which mutates the loaded
# ORM objects directly (see welcome_manual_section_service.reorder_sections).
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "title",
    "body",
})


async def list_by_manual(
    db: AsyncSession,
    manual_id: uuid.UUID,
) -> list[WelcomeManualSection]:
    """List sections for a manual in display order (then by creation time)."""
    result = await db.execute(
        select(WelcomeManualSection)
        .where(WelcomeManualSection.manual_id == manual_id)
        .order_by(
            WelcomeManualSection.display_order.asc(),
            WelcomeManualSection.created_at.asc(),
        )
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    section_id: uuid.UUID,
    manual_id: uuid.UUID,
) -> WelcomeManualSection | None:
    """Return the section iff it exists and belongs to the given manual."""
    result = await db.execute(
        select(WelcomeManualSection).where(
            WelcomeManualSection.id == section_id,
            WelcomeManualSection.manual_id == manual_id,
        )
    )
    return result.scalar_one_or_none()


async def next_display_order(
    db: AsyncSession,
    manual_id: uuid.UUID,
) -> int:
    """Return the next display_order slot for a manual (max + 1, or 0 if empty)."""
    result = await db.execute(
        select(func.max(WelcomeManualSection.display_order)).where(
            WelcomeManualSection.manual_id == manual_id,
        )
    )
    current = result.scalar_one_or_none()
    return 0 if current is None else int(current) + 1


async def counts_by_manual_ids(
    db: AsyncSession,
    manual_ids: list[uuid.UUID],
) -> dict[uuid.UUID, int]:
    """Return ``{manual_id: section_count}`` for the given manuals in one query.

    Avoids an N+1 when building list-view summaries. Manuals with no sections
    are simply absent from the dict (callers default to 0).
    """
    if not manual_ids:
        return {}
    result = await db.execute(
        select(
            WelcomeManualSection.manual_id,
            func.count(WelcomeManualSection.id),
        )
        .where(WelcomeManualSection.manual_id.in_(manual_ids))
        .group_by(WelcomeManualSection.manual_id)
    )
    return {row[0]: int(row[1]) for row in result.all()}


async def create(
    db: AsyncSession,
    *,
    manual_id: uuid.UUID,
    title: str,
    body: str | None,
    display_order: int,
) -> WelcomeManualSection:
    section = WelcomeManualSection(
        manual_id=manual_id,
        title=title,
        body=body,
        display_order=display_order,
    )
    db.add(section)
    await db.flush()
    return section


async def update(
    db: AsyncSession,
    section_id: uuid.UUID,
    manual_id: uuid.UUID,
    fields: dict[str, Any],
) -> WelcomeManualSection | None:
    """Apply allowlisted updates to a section.

    Returns the refreshed section, or None if the section doesn't exist /
    belongs to a different manual.
    """
    section = await get_by_id(db, section_id, manual_id)
    if section is None:
        return None
    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return section
    for key, value in safe_fields.items():
        setattr(section, key, value)
    await db.flush()
    return section


async def delete_by_id(
    db: AsyncSession,
    section_id: uuid.UUID,
    manual_id: uuid.UUID,
) -> WelcomeManualSection | None:
    """Delete a section and return the deleted row (so the caller can reach its
    image storage keys for object-store cleanup in PR 2). None if no match."""
    section = await get_by_id(db, section_id, manual_id)
    if section is None:
        return None
    await db.execute(
        delete(WelcomeManualSection).where(
            WelcomeManualSection.id == section_id,
            WelcomeManualSection.manual_id == manual_id,
        )
    )
    return section
