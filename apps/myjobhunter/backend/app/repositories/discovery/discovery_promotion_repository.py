"""The link from a discovered job to the application it was promoted to.

Applications are soft-deleted, so ``promoted_application_id``'s
``ON DELETE SET NULL`` never fires. Deleting an application clears the link
here instead, in the same transaction, so the posting is a posting again:
back in Discover, and Promote makes a fresh application.
"""
from __future__ import annotations

import uuid

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob


async def clear_promotion_links(
    db: AsyncSession, user_id: uuid.UUID, application_id: uuid.UUID,
) -> None:
    """Unlink the caller's postings from ``application_id`` (more than one when
    Promote went to a twin). Clears ``promoted_at`` too, per chk_discovered_promoted."""
    await db.execute(
        update(DiscoveredJob)
        .where(
            DiscoveredJob.user_id == user_id,
            DiscoveredJob.promoted_application_id == application_id,
        )
        .values(promoted_application_id=None, promoted_at=None)
        .execution_options(synchronize_session="fetch"),
    )
