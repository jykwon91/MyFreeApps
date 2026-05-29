"""Inbox-aggregate queries for the /discover surface.

Split out of ``discovery_repository`` (which is already a large module) to
keep that file from growing further per the project's no-growth file-size
policy. Holds read-only aggregate queries over the inbox population that
reuse the same active-only predicate as ``discovery_repository.list_discovered``
so the counts always describe the same rows the list endpoint returns.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, or_, outerjoin, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch


def active_only_predicate() -> tuple:
    """Shared "active" predicate for the inbox/saved views.

    A row is active unless we observed it vanish upstream (``expired_at``
    set) or its feed-declared close date is in the past.
    ``source_expires_at IS NULL`` rows (no declared expiry — e.g. all
    Greenhouse/Lever rows) stay active. Single source of truth, imported by
    ``discovery_repository.list_discovered`` and reused by the coverage
    count below, so the two populations never drift apart. Lives here
    (rather than in ``discovery_repository``) to keep that already-large
    module from growing under the no-growth file-size policy.
    """
    return (
        DiscoveredJob.expired_at.is_(None),
        or_(
            DiscoveredJob.source_expires_at.is_(None),
            DiscoveredJob.source_expires_at >= func.now(),
        ),
    )


async def count_inbox_coverage(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    source_id: uuid.UUID | None = None,
) -> tuple[int, int]:
    """Return ``(scored_count, total_count)`` for the active inbox.

    Both counts use the exact same active-only + triage predicate as the
    ``state="inbox"`` branch of ``discovery_repository.list_discovered``
    (via the shared ``active_only_predicate``), so the coverage line the
    frontend renders ("Scored N of M") matches the rows actually shown —
    not a different population. The counts span the WHOLE inbox,
    independent of the list endpoint's ``limit``/``offset`` page, which is
    why this is a separate aggregate rather than ``len(items)``.

    ``scored_count`` = inbox rows with a non-null ``score``.
    ``total_count``  = all active inbox rows.
    """
    base = select(func.count(DiscoveredJob.id)).where(
        DiscoveredJob.user_id == user_id,
        DiscoveredJob.dismissed_at.is_(None),
        DiscoveredJob.saved_at.is_(None),
        DiscoveredJob.promoted_application_id.is_(None),
        *active_only_predicate(),
    )
    if source_id is not None:
        # Mirror list_discovered's source filter: join the fetch row and
        # restrict to fetches belonging to this saved search.
        base = base.select_from(
            outerjoin(
                DiscoveredJob,
                DiscoveryFetch,
                DiscoveredJob.fetch_id == DiscoveryFetch.id,
            )
        ).where(DiscoveryFetch.discovery_source_id == source_id)

    total_count = (await db.execute(base)).scalar_one()
    scored_count = (
        await db.execute(base.where(DiscoveredJob.score.isnot(None)))
    ).scalar_one()
    return scored_count, total_count
