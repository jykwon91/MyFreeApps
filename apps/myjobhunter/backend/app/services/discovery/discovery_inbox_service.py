"""Service wrappers for discovered-job inbox mutations.

Owns the transaction boundary for dismiss and save operations so route
handlers never call ``db.commit()`` directly.  Per the MJH layered-architecture
convention: routes → services → repositories; services commit, repositories
only ``add``/``flush``.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.discovery import discovery_repository


async def dismiss_discovered(
    db: AsyncSession,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    reason: str | None = None,
) -> bool:
    """Dismiss a discovered job.  Returns False when not found / wrong owner."""
    ok = await discovery_repository.dismiss_discovered(
        db, job_id, user_id, reason=reason,
    )
    if not ok:
        return False
    await db.commit()
    return True


async def save_discovered(
    db: AsyncSession,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Save a discovered job for later.  Returns False when not found / wrong owner."""
    ok = await discovery_repository.save_discovered(db, job_id, user_id)
    if not ok:
        return False
    await db.commit()
    return True
