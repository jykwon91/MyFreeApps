import uuid
from datetime import datetime, timedelta, timezone
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


async def set_share(
    db: AsyncSession,
    manual_id: uuid.UUID,
    organization_id: uuid.UUID,
    *,
    share_token: str,
    share_pin: str,
) -> WelcomeManual | None:
    """First-time share enable. Returns None if the manual doesn't exist /
    is soft-deleted / belongs to a different org."""
    manual = await get_by_id(db, manual_id, organization_id)
    if manual is None:
        return None
    manual.share_token = share_token
    manual.share_pin = share_pin
    await db.flush()
    return manual


async def rotate_pin(
    db: AsyncSession,
    manual_id: uuid.UUID,
    organization_id: uuid.UUID,
    *,
    share_pin: str,
) -> WelcomeManual | None:
    """Rotate the PIN of an already-shared manual. Returns None if the
    manual doesn't exist / is soft-deleted / belongs to a different org.

    Does NOT check ``share_token is not None`` — the caller (service layer)
    is responsible for raising ``ShareNotEnabledError`` before calling this,
    since that's a distinct 404 case from "manual not found".
    """
    manual = await get_by_id(db, manual_id, organization_id)
    if manual is None:
        return None
    manual.share_pin = share_pin
    await db.flush()
    return manual


async def clear_share(
    db: AsyncSession,
    manual_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    """Revoke the share link — clears BOTH ``share_token`` and ``share_pin``.

    Returns True if a row was updated (manual existed, was not soft-deleted,
    and belonged to the org), False otherwise.
    """
    result = await db.execute(
        update(WelcomeManual)
        .where(
            WelcomeManual.id == manual_id,
            WelcomeManual.organization_id == organization_id,
            WelcomeManual.deleted_at.is_(None),
        )
        .values(share_token=None, share_pin=None)
    )
    return (result.rowcount or 0) > 0


async def record_failed_unlock(
    db: AsyncSession,
    manual: WelcomeManual,
    *,
    max_attempts: int,
    lockout_window_seconds: int,
    now: datetime,
) -> None:
    """Register one wrong-PIN unlock attempt on ``manual``.

    Increments ``failed_unlock_count``; once it reaches ``max_attempts`` the
    manual is locked for ``lockout_window_seconds`` and the counter resets to
    0 so the next window starts clean. Mutates the already-loaded object (the
    public unlock path holds it) rather than re-querying — matches the
    ``set_share`` / ``rotate_pin`` style and keeps the value fresh in-session.
    """
    manual.failed_unlock_count += 1
    if manual.failed_unlock_count >= max_attempts:
        manual.unlock_locked_until = now + timedelta(seconds=lockout_window_seconds)
        manual.failed_unlock_count = 0
    await db.flush()


async def reset_unlock_state(
    db: AsyncSession,
    manual: WelcomeManual,
) -> None:
    """Clear the brute-force lockout counters after a successful unlock, so a
    guest reopening the guide with the correct PIN never accumulates toward a
    lockout. No-op (no flush) when already clean to avoid a needless write on
    the common repeat-visit path."""
    if manual.failed_unlock_count == 0 and manual.unlock_locked_until is None:
        return
    manual.failed_unlock_count = 0
    manual.unlock_locked_until = None
    await db.flush()


async def get_by_share_token(
    db: AsyncSession,
    share_token: str,
) -> WelcomeManual | None:
    """Public lookup by share token — deliberately NOT org-scoped (the
    caller has no organization context yet). Respects soft-delete so a
    deleted manual's stale token can never resolve.
    """
    result = await db.execute(
        select(WelcomeManual).where(
            WelcomeManual.share_token == share_token,
            WelcomeManual.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()
