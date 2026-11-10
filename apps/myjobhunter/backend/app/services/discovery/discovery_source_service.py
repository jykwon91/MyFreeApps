"""Service wrappers for saved-search (DiscoverySource) mutations.

Owns the transaction boundary for create and deactivate operations so route
handlers never call ``db.commit()`` directly.  Per the MJH layered-architecture
convention: routes → services → repositories; services commit, repositories
only ``add``/``flush``.

The committed row IS the schedule: ``is_active`` and
``fetch_interval_minutes`` are what the scheduler process reconciles its
jobs from (within ``RECONCILE_INTERVAL_SECONDS``). Nothing here talks to
APScheduler — the API process never runs a scheduler. See
``discovery_scheduler_service`` for the design.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovery_source import DiscoverySource
from app.repositories.discovery import discovery_repository



class DiscoverySourceNameConflictError(Exception):
    """Raised when an active source with the same user+kind+name already exists."""


async def create_source(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    source: str,
    name: str = "",
    config: dict | None = None,
    fetch_interval_minutes: int = 1440,
) -> DiscoverySource:
    """Create a new active saved search and commit the transaction.

    Raises ``DiscoverySourceNameConflictError`` when another active source
    for the same user, kind, and name already exists. The caller should
    translate this to a 409 HTTP response.

    The scheduler process picks the new source up on its next reconcile.
    """
    # Pre-flight uniqueness check at the service layer so we can surface a
    # clean 409 with a human-readable message instead of letting the DB raise
    # an IntegrityError that would roll back the outer transaction.
    existing = await discovery_repository.find_active_source_by_name(
        db, user_id=user_id, source=source, name=name,
    )
    if existing is not None:
        raise DiscoverySourceNameConflictError(
            f"An active '{source}' source named {name!r} already exists. "
            "Pick a different name to create a second source of this kind."
            if name
            else
            f"An active '{source}' source already exists. "
            "Give this source a name to add a second one of the same kind."
        )

    src = await discovery_repository.create_source(
        db,
        user_id=user_id,
        source=source,
        name=name,
        config=config,
        fetch_interval_minutes=fetch_interval_minutes,
    )
    await db.commit()
    await db.refresh(src)
    return src


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
    """Partially update a saved search and commit the transaction.

    Returns the updated row, or None when not found / wrong owner.

    ``config`` when provided **replaces** the entire config JSONB blob.
    Per-source validation is the caller's responsibility — the schema
    layer (``DiscoverySourcePatch._validate_config_per_source``) runs
    validation at the HTTP boundary before this service is invoked.

    A changed interval or ``is_active`` flag reaches the scheduler process
    on its next reconcile.
    """
    src = await discovery_repository.update_source(
        db,
        source_id,
        user_id,
        fetch_interval_minutes=fetch_interval_minutes,
        name=name,
        is_active=is_active,
        config=config,
    )
    if src is None:
        return None

    await db.commit()
    await db.refresh(src)
    return src


async def deactivate_source(
    db: AsyncSession,
    source_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Soft-deactivate a saved search.  Returns False when not found / wrong owner.

    The scheduler process drops the job on its next reconcile; the job
    runner also re-checks ``is_active`` before fetching, so a fire inside
    that window is a no-op.
    """
    ok = await discovery_repository.deactivate_source(db, source_id, user_id)
    if not ok:
        return False
    await db.commit()
    return True
