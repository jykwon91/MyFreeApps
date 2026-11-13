"""Cross-source twins of a discovered job, for the triage writes.

``uq_discovered_user_content_hash`` lets each user hold one undismissed row
per ``content_hash`` (the same posting seen through two sources). A dismissed
row gives up that slot, so a later fetch can bring in a twin; clearing the
dismissal (Save, Restore, Promote) must then not collide with the twin.
Split out of ``discovery_repository`` per the no-growth file-size policy.
"""
from __future__ import annotations

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.repositories.discovery.discovery_inbox_repository import active_only_predicate

# The unique index a twin holds; clearing a dismissal can violate it.
TWIN_INDEX_NAME = "uq_discovered_user_content_hash"


async def get_active_twin(db: AsyncSession, job: DiscoveredJob) -> DiscoveredJob | None:
    """The undismissed row holding ``job``'s content-hash slot, locked; else None.

    The slot holder may have expired or closed since (``is_listed``): the index
    doesn't look at that, so it still blocks ``job``.

    None without a query when ``job`` cannot collide: it holds the slot itself
    (not dismissed) or has no hash. The unique index allows at most one twin.

    A fetch can still insert a twin after this check and before the caller
    commits; the write then violates ``TWIN_INDEX_NAME``, which callers catch.
    """
    if job.dismissed_at is None or job.content_hash is None:
        return None
    stmt = (
        select(DiscoveredJob)
        .where(
            DiscoveredJob.user_id == job.user_id,
            DiscoveredJob.content_hash == job.content_hash,
            DiscoveredJob.dismissed_at.is_(None),
            DiscoveredJob.id != job.id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def is_listed(db: AsyncSession, job: DiscoveredJob) -> bool:
    """Whether ``job`` is still listed upstream: not expired, not past its close date."""
    stmt = select(exists().where(DiscoveredJob.id == job.id, *active_only_predicate()))
    return (await db.execute(stmt)).scalar_one()
