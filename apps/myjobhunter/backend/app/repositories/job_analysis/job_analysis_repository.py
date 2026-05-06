"""Repository for ``job_analyses`` — owns every query against the table.

Per the layered-architecture rule (apps/myjobhunter/CLAUDE.md): routes
never touch the ORM, services orchestrate, repositories return ORM rows.
Every public function takes ``user_id`` and filters by it — tenant
scoping is mandatory.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job_analysis.job_analysis import JobAnalysis


async def get_by_id(
    db: AsyncSession,
    analysis_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    include_deleted: bool = False,
) -> JobAnalysis | None:
    """Return a single analysis scoped to ``user_id`` or ``None``.

    Soft-deleted rows are filtered by default; pass ``include_deleted=True``
    so a second DELETE on an already-deleted row remains idempotent.
    """
    stmt = select(JobAnalysis).where(
        JobAnalysis.id == analysis_id,
        JobAnalysis.user_id == user_id,
    )
    if not include_deleted:
        stmt = stmt.where(JobAnalysis.deleted_at.is_(None))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_by_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[JobAnalysis]:
    """List the user's non-deleted analyses, newest-first."""
    stmt = (
        select(JobAnalysis)
        .where(
            JobAnalysis.user_id == user_id,
            JobAnalysis.deleted_at.is_(None),
        )
        .order_by(JobAnalysis.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create(db: AsyncSession, analysis: JobAnalysis) -> JobAnalysis:
    """Persist a new ``JobAnalysis``."""
    db.add(analysis)
    await db.flush()
    await db.refresh(analysis)
    return analysis


async def update(
    db: AsyncSession,
    analysis: JobAnalysis,
    updates: dict[str, Any],
) -> JobAnalysis:
    """Apply allowlisted updates to a JobAnalysis row.

    The only column callers update today is ``applied_application_id``
    (set when the operator clicks "Add to applications"). The allowlist
    is conservative on purpose — analyses are otherwise immutable.
    """
    allow = {"applied_application_id"}
    for key, value in updates.items():
        if key in allow:
            setattr(analysis, key, value)
    await db.flush()
    await db.refresh(analysis)
    return analysis
