"""Inbox-aggregate queries for the /discover surface.

Split out of ``discovery_repository`` (which is already a large module) to
keep that file from growing further per the project's no-growth file-size
policy. Holds the per-view row predicate and the read-only aggregate queries over
it. ``discovery_repository.list_discovered`` filters with the same
``discovered_state_predicate`` so the counts always describe the same rows the
list endpoint returns.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, or_, outerjoin, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.discovered_job_state import DiscoveredJobState
from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch


def active_only_predicate() -> tuple:
    """Shared "active" predicate for the inbox/saved/dismissed views.

    A row is active unless we observed it vanish upstream (``expired_at``
    set) or its feed-declared close date is in the past.
    ``source_expires_at IS NULL`` rows (no declared expiry — e.g. all
    Greenhouse/Lever rows) stay active.
    """
    return (
        DiscoveredJob.expired_at.is_(None),
        or_(
            DiscoveredJob.source_expires_at.is_(None),
            DiscoveredJob.source_expires_at >= func.now(),
        ),
    )


def discovered_state_predicate(state: DiscoveredJobState) -> tuple:
    """The WHERE clauses for one ``GET /discover`` view.

    The single source of truth for which rows a view holds: the list query
    (``discovery_repository.list_discovered``), its pagination ``total``
    (``count_discovered``) and the inbox coverage (``count_inbox_coverage``)
    all filter with it, so the populations never drift apart.

    - ``inbox``: not dismissed, not saved, not promoted, and active.
    - ``saved``: saved (so not dismissed — chk_discovered_state) and active.
    - ``dismissed``: dismissed, not promoted, and active. These are exactly the
      rows Restore (``undo_dismiss_discovered``) brings back into the inbox:
      restoring an expired/closed posting or one already turned into an
      application would make it vanish from every view, so neither is listed.
    - ``all``: every row, expired and closed ones included.
    """
    if state == "inbox":
        return (
            DiscoveredJob.dismissed_at.is_(None),
            DiscoveredJob.saved_at.is_(None),
            DiscoveredJob.promoted_application_id.is_(None),
            *active_only_predicate(),
        )
    if state == "saved":
        return (
            DiscoveredJob.saved_at.isnot(None),
            DiscoveredJob.dismissed_at.is_(None),
            *active_only_predicate(),
        )
    if state == "dismissed":
        return (
            DiscoveredJob.dismissed_at.isnot(None),
            DiscoveredJob.promoted_application_id.is_(None),
            *active_only_predicate(),
        )
    return ()


async def count_inbox_coverage(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    source_id: uuid.UUID | None = None,
) -> tuple[int, int]:
    """Return ``(scored_count, total_count)`` for the active inbox.

    Both counts use the exact same predicate as the ``state="inbox"`` list
    (``discovered_state_predicate("inbox")``), so the coverage line the
    frontend renders ("Scored N of M") matches the rows actually shown —
    not a different population. The counts span the WHOLE inbox,
    independent of the list endpoint's ``limit``/``offset`` page, which is
    why this is a separate aggregate rather than ``len(items)``.

    ``scored_count`` = inbox rows with a non-null ``score``.
    ``total_count``  = all active inbox rows.
    """
    base = select(func.count(DiscoveredJob.id)).where(
        DiscoveredJob.user_id == user_id,
        *discovered_state_predicate("inbox"),
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


async def count_discovered(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    state: DiscoveredJobState = "inbox",
    source_id: uuid.UUID | None = None,
) -> int:
    """Total rows matching the ``state`` / ``source_id`` filter — the pagination
    ``total`` for ``GET /discover``.

    Filters with the same ``discovered_state_predicate`` as
    ``discovery_repository.list_discovered`` so ``total`` describes exactly the
    population the list endpoint paginates over, independent of ``limit`` /
    ``offset``. The service reuses ``count_inbox_coverage``'s ``total_count``
    for the inbox (same population), so this is called for the other views.
    """
    stmt = select(func.count(DiscoveredJob.id)).where(
        DiscoveredJob.user_id == user_id,
        *discovered_state_predicate(state),
    )
    if source_id is not None:
        stmt = stmt.select_from(
            outerjoin(
                DiscoveredJob,
                DiscoveryFetch,
                DiscoveredJob.fetch_id == DiscoveryFetch.id,
            )
        ).where(DiscoveryFetch.discovery_source_id == source_id)
    return (await db.execute(stmt)).scalar_one()
