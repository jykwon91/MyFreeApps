"""Reads for the discovery scheduler process.

Kept apart from ``discovery_repository`` because it is the one deliberately
cross-tenant read in the discovery domain: the scheduler process needs every
user's active saved searches to know which jobs should exist. Never call it
from a request path — request paths go through the user-scoped functions in
``discovery_repository``.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovery_source import DiscoverySource


async def list_all_active_sources(db: AsyncSession) -> list[DiscoverySource]:
    """Every active source across all users — the desired schedule."""
    stmt = select(DiscoverySource).where(DiscoverySource.is_active.is_(True))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_source_for_scheduler(
    db: AsyncSession, source_id: uuid.UUID,
) -> DiscoverySource | None:
    """Load a source by id alone, for the scheduled-fetch job.

    Not tenant-filtered on purpose: the job compares the row's ``user_id``
    with the one in its payload and treats a mismatch as scheduler-state
    drift (``SchedulerSourceMismatchError``) — filtering here would hide it.
    """
    return await db.get(DiscoverySource, source_id)
