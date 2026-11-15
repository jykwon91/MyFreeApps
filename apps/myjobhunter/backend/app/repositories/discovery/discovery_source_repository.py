"""Repository for saved searches (``discovery_sources``).

Split out of ``discovery_repository`` per the no-growth file-size policy.
Every public function takes ``user_id`` and filters by it — tenant scoping
is mandatory. Repositories only ``add``/``flush``; services commit.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovery_source import DiscoverySource


async def create_source(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    source: str,
    name: str = "",
    config: dict | None = None,
    fetch_interval_minutes: int = 1440,
) -> DiscoverySource:
    """Create a new active saved search."""
    row = DiscoverySource(
        user_id=user_id,
        source=source,
        name=name,
        config=config or {},
        fetch_interval_minutes=fetch_interval_minutes,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def find_active_source_by_name(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    source: str,
    name: str,
    exclude_id: uuid.UUID | None = None,
) -> DiscoverySource | None:
    """Return the active source matching (user_id, source, name), if any.

    Used by the service layer for a pre-flight uniqueness check before
    inserting or updating a row. ``exclude_id`` leaves the row being
    updated out of the match so it never conflicts with itself. Returns
    ``None`` when no conflict exists.
    """
    stmt = select(DiscoverySource).where(
        DiscoverySource.user_id == user_id,
        DiscoverySource.source == source,
        DiscoverySource.name == name,
        DiscoverySource.is_active.is_(True),
    )
    if exclude_id is not None:
        stmt = stmt.where(DiscoverySource.id != exclude_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_source(
    db: AsyncSession, source_id: uuid.UUID, user_id: uuid.UUID,
) -> DiscoverySource | None:
    stmt = select(DiscoverySource).where(
        DiscoverySource.id == source_id,
        DiscoverySource.user_id == user_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_sources(
    db: AsyncSession, user_id: uuid.UUID, *, active_only: bool = True,
) -> list[DiscoverySource]:
    stmt = select(DiscoverySource).where(DiscoverySource.user_id == user_id)
    if active_only:
        stmt = stmt.where(DiscoverySource.is_active.is_(True))
    stmt = stmt.order_by(DiscoverySource.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def deactivate_source(
    db: AsyncSession, source_id: uuid.UUID, user_id: uuid.UUID,
) -> bool:
    """Soft-deactivate a saved search. Idempotent."""
    src = await get_source(db, source_id, user_id)
    if src is None:
        return False
    src.is_active = False
    await db.flush()
    return True


async def update_source(
    db: AsyncSession,
    source_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    fetch_interval_minutes: int | None = None,
    name: str | None = None,
    is_active: bool | None = None,
    config: dict | None = None,
) -> DiscoverySource | None:
    """Partial-update a saved search. Returns None when not found / wrong owner.

    Only applies the fields that are explicitly provided (not None). This
    allows the PATCH route to accept a sparse body — fields omitted by
    the caller are left unchanged. Callers are responsible for committing.

    ``config`` replaces the entire JSONB blob when provided. The caller
    (service layer, dispatched from the schema validator) is responsible
    for ensuring the config is valid for the source kind before calling.
    SQLAlchemy does not detect in-place dict mutations on JSONB columns,
    so we assign a new dict object to trigger change tracking.
    """
    src = await get_source(db, source_id, user_id)
    if src is None:
        return None
    if fetch_interval_minutes is not None:
        src.fetch_interval_minutes = fetch_interval_minutes
    if name is not None:
        src.name = name
    if is_active is not None:
        src.is_active = is_active
    if config is not None:
        # Assign a new dict to ensure SQLAlchemy detects the change.
        # In-place mutation of a JSONB dict is silently ignored by the
        # ORM because the identity hasn't changed.
        src.config = dict(config)
    await db.flush()
    await db.refresh(src)
    return src


async def mark_source_fetched(
    db: AsyncSession,
    source: DiscoverySource,
    *,
    success: bool,
    error_message: str | None = None,
    seen_posted_at: datetime | None = None,
) -> None:
    """Update the source's audit columns after a fetch attempt."""
    now = datetime.now(timezone.utc)
    source.last_fetched_at = now
    if success:
        source.last_success_at = now
        source.consecutive_failures = 0
        source.last_error_at = None
        source.last_error_message = None
        if seen_posted_at is not None and (
            source.last_seen_posted_at is None
            or seen_posted_at > source.last_seen_posted_at
        ):
            source.last_seen_posted_at = seen_posted_at
    else:
        source.consecutive_failures = (source.consecutive_failures or 0) + 1
        source.last_error_at = now
        source.last_error_message = (error_message or "")[:500]
    await db.flush()
