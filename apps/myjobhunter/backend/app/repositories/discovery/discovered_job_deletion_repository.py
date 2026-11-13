"""Hard deletion of a user's ``discovered_jobs`` rows, for account deletion.

Kept out of ``discovery_repository`` (already over the no-growth file-size
threshold).
"""
from __future__ import annotations

import uuid

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob


async def delete_all_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Hard-delete every discovered posting a user owns, promoted ones included.

    Only account deletion uses this.
    """
    await db.execute(delete(DiscoveredJob).where(DiscoveredJob.user_id == user_id))
