"""Repository for embedding-related reads/writes on discovery + profile tables.

Per the layered-architecture rule (``apps/myjobhunter/CLAUDE.md``): routes
never touch the ORM, services orchestrate, repositories return ORM rows.
``discovery_embedding_service`` orchestrates fastembed calls + the
field-assembly contract; this module owns the SQL.

Functions are tenant-scoped: every write filters by ``user_id`` so a
miswired caller can't update another user's row.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.profile.profile import Profile
from app.models.profile.skill import Skill
from app.models.profile.work_history import WorkHistory


# ---------------------------------------------------------------------------
# discovered_jobs — embedding backfill
# ---------------------------------------------------------------------------


async def list_unembedded_for_user(
    db: AsyncSession, user_id: uuid.UUID, *, limit: int,
) -> list[DiscoveredJob]:
    """Return up to ``limit`` rows for ``user_id`` where ``embedding IS NULL``.

    Drives the backfill loop in ``discovery_embedding_service.embed_pending_for_user``.
    Order is irrelevant to correctness (the loop reads all NULL rows
    eventually); leaving it unordered lets Postgres pick whatever scan
    plan is cheapest.
    """
    stmt = (
        select(DiscoveredJob)
        .where(
            DiscoveredJob.user_id == user_id,
            DiscoveredJob.embedding.is_(None),
        )
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def write_posting_embeddings(
    db: AsyncSession,
    rows: list[DiscoveredJob],
    *,
    vectors: list[list[float]],
    model_name: str,
) -> None:
    """Apply (vector, model_name, embedded_at=now) to each row in ``rows``.

    The caller produces the vector via the embedding service; this
    repository writes them in one batch. Single commit so a partial
    failure rolls the whole batch back instead of leaving some rows
    half-updated.
    """
    if len(rows) != len(vectors):
        raise ValueError(
            f"row/vector mismatch: {len(rows)} rows vs {len(vectors)} vectors",
        )
    now = datetime.now(timezone.utc)
    for row, vec in zip(rows, vectors):
        row.embedding = vec
        row.embedding_model = model_name
        row.embedded_at = now
    await db.flush()
    await db.commit()


# ---------------------------------------------------------------------------
# profiles — embedding refresh
# ---------------------------------------------------------------------------


async def get_profile_for_embedding(
    db: AsyncSession, user_id: uuid.UUID,
) -> Profile | None:
    """Fetch the user's profile (or None) so the service can compute its
    embedding text. Single-row read; tenant-scoped."""
    result = await db.execute(
        select(Profile).where(Profile.user_id == user_id),
    )
    return result.scalar_one_or_none()


async def list_profile_skills(
    db: AsyncSession, user_id: uuid.UUID,
) -> list[Skill]:
    """All skill rows for the user. Returned in insertion order — the
    embedding text doesn't depend on ordering."""
    result = await db.execute(
        select(Skill).where(Skill.user_id == user_id),
    )
    return list(result.scalars().all())


async def list_profile_work_history(
    db: AsyncSession, user_id: uuid.UUID,
) -> list[WorkHistory]:
    """All work-history rows for the user. Same ordering note as
    ``list_profile_skills``."""
    result = await db.execute(
        select(WorkHistory).where(WorkHistory.user_id == user_id),
    )
    return list(result.scalars().all())


async def write_profile_embedding(
    db: AsyncSession,
    profile: Profile,
    *,
    vector: list[float],
    model_name: str,
) -> None:
    """Persist a new embedding for ``profile`` and commit."""
    profile.embedding = vector
    profile.embedding_model = model_name
    profile.embedded_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()
