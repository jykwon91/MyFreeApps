import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.welcome_manuals.welcome_manual import WelcomeManual

# Columns mutable via the dynamic ``update_manual`` path. Tenant-scoping
# columns (organization_id, user_id) and server-managed columns
# (id, created_at, updated_at, deleted_at) are deliberately excluded, per the
# project rule: validate field names against an explicit allowlist before
# applying dynamic updates.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "property_id",
    "title",
    "intro_text",
})


async def get_by_id(
    db: AsyncSession,
    manual_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> WelcomeManual | None:
    """Return the manual iff it exists, is not soft-deleted, and belongs to the org."""
    result = await db.execute(
        select(WelcomeManual).where(
            WelcomeManual.id == manual_id,
            WelcomeManual.organization_id == organization_id,
            WelcomeManual.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def list_by_organization(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[WelcomeManual]:
    """List non-deleted manuals for an organization, newest first."""
    result = await db.execute(
        select(WelcomeManual)
        .where(
            WelcomeManual.organization_id == organization_id,
            WelcomeManual.deleted_at.is_(None),
        )
        .order_by(WelcomeManual.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def count_by_organization(
    db: AsyncSession,
    organization_id: uuid.UUID,
) -> int:
    """Count non-deleted manuals for an organization (powers the paginated total)."""
    result = await db.execute(
        select(func.count(WelcomeManual.id)).where(
            WelcomeManual.organization_id == organization_id,
            WelcomeManual.deleted_at.is_(None),
        )
    )
    return int(result.scalar_one() or 0)


async def create_manual(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID | None,
    title: str,
    intro_text: str | None,
) -> WelcomeManual:
    manual = WelcomeManual(
        organization_id=organization_id,
        user_id=user_id,
        property_id=property_id,
        title=title,
        intro_text=intro_text,
    )
    db.add(manual)
    await db.flush()
    return manual


async def update_manual(
    db: AsyncSession,
    manual_id: uuid.UUID,
    organization_id: uuid.UUID,
    fields: dict[str, Any],
) -> WelcomeManual | None:
    """Apply allowlisted updates to a manual.

    Returns the refreshed manual, or None if it does not exist / is
    soft-deleted / belongs to a different organization.
    """
    manual = await get_by_id(db, manual_id, organization_id)
    if manual is None:
        return None
    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return manual
    for key, value in safe_fields.items():
        setattr(manual, key, value)
    await db.flush()
    return manual


async def soft_delete_by_id(
    db: AsyncSession,
    manual_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    """Soft-delete a manual scoped to an organization.

    Returns True if a row was updated (manual existed and was not already
    soft-deleted), False otherwise so the route can 404 without a round trip.
    """
    result = await db.execute(
        update(WelcomeManual)
        .where(
            WelcomeManual.id == manual_id,
            WelcomeManual.organization_id == organization_id,
            WelcomeManual.deleted_at.is_(None),
        )
        .values(deleted_at=datetime.now(timezone.utc))
    )
    return (result.rowcount or 0) > 0


async def hard_delete_by_id(
    db: AsyncSession,
    manual_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> None:
    """Hard-delete a manual scoped to an organization. Test-utility only —
    production code uses soft-delete (set deleted_at)."""
    await db.execute(
        delete(WelcomeManual).where(
            WelcomeManual.id == manual_id,
            WelcomeManual.organization_id == organization_id,
        )
    )
