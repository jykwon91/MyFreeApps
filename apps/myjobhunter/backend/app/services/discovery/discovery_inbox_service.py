"""Service wrappers for discovered-job inbox mutations.

Owns the transaction boundary for dismiss and save operations so route
handlers never call ``db.commit()`` directly.  Per the MJH layered-architecture
convention: routes → services → repositories; services commit, repositories
only ``add``/``flush``.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.discovery import (
    discovery_inbox_repository,
    discovery_repository,
)
from app.services.discovery.discovered_job_page import DiscoveredJobPage


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


async def undo_dismiss_for_user(
    db: AsyncSession,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Reverse a dismiss — clears dismissed_at and dismissed_reason.

    Returns False (→ 404) when:
    - The job doesn't exist / belongs to a different user.
    - The job is not currently dismissed (never dismissed, or already active).
    """
    row = await discovery_repository.undo_dismiss_discovered(db, job_id, user_id)
    if row is None:
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


async def list_discovered_page(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    state: str,
    limit: int,
    offset: int,
    source_id: uuid.UUID | None,
) -> DiscoveredJobPage:
    """Load one page of discovered jobs plus its pagination/coverage counts."""
    rows = await discovery_repository.list_discovered(
        db, user_id, state=state, limit=limit, offset=offset, source_id=source_id,
    )

    # Coverage is only meaningful for the triage inbox: most fetched rows
    # stay unscored (the scorer only rates the prefilter top-N per day),
    # and the frontend surfaces "Scored N of M" so that tail reads as
    # "daily limit reached" rather than "broken". The saved/all views
    # don't carry the framing, so leave the counts null there.
    scored_count: int | None = None
    total_count: int | None = None
    if state == "inbox":
        scored_count, total_count = await discovery_inbox_repository.count_inbox_coverage(
            db, user_id, source_id=source_id,
        )
        # The inbox pagination total IS the active-inbox row count, which
        # count_inbox_coverage already computed — reuse it (no second COUNT).
        total = total_count
    else:
        total = await discovery_inbox_repository.count_discovered(
            db, user_id, state=state, source_id=source_id,
        )
    return DiscoveredJobPage(
        rows=rows, total=total, scored_count=scored_count, total_count=total_count,
    )
