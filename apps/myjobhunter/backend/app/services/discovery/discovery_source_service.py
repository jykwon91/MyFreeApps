"""Service wrappers for saved-search (DiscoverySource) mutations.

Owns the transaction boundary for create and deactivate operations so route
handlers never call ``db.commit()`` directly.  Per the MJH layered-architecture
convention: routes → services → repositories; services commit, repositories
only ``add``/``flush``.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovery_source import DiscoverySource
from app.repositories.discovery import discovery_repository


async def create_source(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    source: str,
    config: dict | None = None,
    fetch_interval_minutes: int = 1440,
) -> DiscoverySource:
    """Create a new active saved search and commit the transaction."""
    src = await discovery_repository.create_source(
        db,
        user_id=user_id,
        source=source,
        config=config,
        fetch_interval_minutes=fetch_interval_minutes,
    )
    await db.commit()
    await db.refresh(src)
    return src


async def deactivate_source(
    db: AsyncSession,
    source_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Soft-deactivate a saved search.  Returns False when not found / wrong owner."""
    ok = await discovery_repository.deactivate_source(db, source_id, user_id)
    if not ok:
        return False
    await db.commit()
    return True
