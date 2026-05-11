"""Repository for the two-stage-scoring prefilter (PR 4b).

Per the layered-architecture rule (``apps/myjobhunter/CLAUDE.md``):
routes never touch the ORM, services orchestrate, repositories return
ORM rows. ``discovery_prefilter_service`` orchestrates the
embedding-vs-FIFO branch; this module owns the SQL.

The ``embedding`` branch uses pgvector's cosine-distance operator
``<=>``. The ``ix_discovered_jobs_embedding`` ivfflat index (added in
PR 4a) covers this query. The FIFO branch is used when the user has
no profile embedding yet — order by ``discovered_at DESC`` so the
operator at least scores their freshest postings while the profile
ripens.

Both functions filter out the same triaged set as
``list_unscored_for_user`` (dismissed / saved / promoted / already-scored)
plus an additional ``embedding IS NOT NULL`` filter on the
embedding-ranked branch (we can't compute cosine distance against a
NULL vector).
"""
from __future__ import annotations

import uuid

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.profile.profile import Profile


async def list_unscored_with_embedding_ranked(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    profile_embedding: list[float],
    top_n: int,
) -> list[DiscoveredJob]:
    """Return up to ``top_n`` unscored postings ranked by cosine similarity.

    Uses pgvector's ``<=>`` cosine-distance operator (smaller = more
    similar). The ``embedding IS NOT NULL`` filter is required: ``<=>``
    on a NULL vector evaluates to NULL and would silently exclude rows
    via the ORDER BY; making the filter explicit also lets the planner
    use the partial index where it exists.

    Filters:
        ``user_id`` matches (tenant scoping — mandatory)
        ``dismissed_at IS NULL`` — operator has not rejected this row
        ``saved_at IS NULL`` — operator has not saved-for-later this row
        ``promoted_application_id IS NULL`` — not yet promoted to apps
        ``score IS NULL`` — not yet scored (this pass produces a score)
        ``embedding IS NOT NULL`` — needed for the cosine ranking
    """
    stmt = (
        select(DiscoveredJob)
        .where(
            DiscoveredJob.user_id == user_id,
            DiscoveredJob.dismissed_at.is_(None),
            DiscoveredJob.saved_at.is_(None),
            DiscoveredJob.promoted_application_id.is_(None),
            DiscoveredJob.score.is_(None),
            DiscoveredJob.embedding.isnot(None),
        )
        .order_by(DiscoveredJob.embedding.cosine_distance(profile_embedding))
        .limit(top_n)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_unscored_fifo_fallback(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    top_n: int,
) -> list[DiscoveredJob]:
    """Return up to ``top_n`` unscored postings ordered by ``discovered_at DESC``.

    Used when the user does NOT have a profile embedding yet (newly
    onboarded operator hasn't filled in skills / work history / resume
    yet). Without an embedding to rank against, falling back to FIFO
    means the operator at least gets *some* scoring on their freshest
    postings while their profile ripens.

    No ``embedding IS NOT NULL`` filter here — a posting without an
    embedding is still a valid scoring candidate when we have nothing
    to rank against.
    """
    stmt = (
        select(DiscoveredJob)
        .where(
            DiscoveredJob.user_id == user_id,
            DiscoveredJob.dismissed_at.is_(None),
            DiscoveredJob.saved_at.is_(None),
            DiscoveredJob.promoted_application_id.is_(None),
            DiscoveredJob.score.is_(None),
        )
        .order_by(desc(DiscoveredJob.discovered_at))
        .limit(top_n)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_unscored_with_embedding(
    db: AsyncSession, user_id: uuid.UUID,
) -> int:
    """Return the number of eligible unscored postings that have an embedding.

    Used by the prefilter service for the Sentry breadcrumb so the
    operator can see ``prefilter_eligible_count`` vs
    ``prefilter_returned_count`` on every score pass. Cheap count —
    one scalar query, indexed on ``user_id`` + the partial
    ``ix_discovered_score_pending``.
    """
    stmt = select(func.count(DiscoveredJob.id)).where(
        DiscoveredJob.user_id == user_id,
        DiscoveredJob.dismissed_at.is_(None),
        DiscoveredJob.saved_at.is_(None),
        DiscoveredJob.promoted_application_id.is_(None),
        DiscoveredJob.score.is_(None),
        DiscoveredJob.embedding.isnot(None),
    )
    result = await db.execute(stmt)
    return int(result.scalar_one() or 0)


async def get_profile_embedding(
    db: AsyncSession, user_id: uuid.UUID,
) -> list[float] | None:
    """Return the user's profile embedding vector, or None if absent.

    Returns the raw vector (not the Profile row) — the prefilter service
    only needs the vector for the cosine query. Returns None when the
    profile row doesn't exist OR when it exists but ``embedding IS NULL``
    (e.g., the operator hasn't filled in skills / work history yet).
    """
    stmt = select(Profile.embedding).where(Profile.user_id == user_id)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        return None
    # pgvector returns numpy arrays; coerce to list[float] so callers
    # don't have to import numpy.
    return list(row)
