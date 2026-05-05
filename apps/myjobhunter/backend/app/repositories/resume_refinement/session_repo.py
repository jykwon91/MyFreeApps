"""Data-access layer for resume_refinement_sessions.

Every read/write is tenant-scoped on ``user_id`` — callers must never
omit it. Service-layer helpers live in
``app.services.resume_refinement.session_service`` and orchestrate the
critique + rewrite loop on top of these primitives.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.resume_refinement.session import ResumeRefinementSession

_RECENT_LIMIT = 25


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    source_resume_job_id: uuid.UUID | None,
    initial_draft: str,
) -> ResumeRefinementSession:
    """Insert a new active session and return the persisted row."""
    session = ResumeRefinementSession(
        user_id=user_id,
        source_resume_job_id=source_resume_job_id,
        current_draft=initial_draft,
        status="active",
    )
    db.add(session)
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def get_by_id_for_user(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ResumeRefinementSession | None:
    """Return a session scoped to the given user, or None."""
    result = await db.execute(
        select(ResumeRefinementSession).where(
            ResumeRefinementSession.id == session_id,
            ResumeRefinementSession.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_with_turns_for_user(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ResumeRefinementSession | None:
    """Return a session with its turns eagerly loaded."""
    result = await db.execute(
        select(ResumeRefinementSession)
        .options(selectinload(ResumeRefinementSession.turns))
        .where(
            ResumeRefinementSession.id == session_id,
            ResumeRefinementSession.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_recent_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[ResumeRefinementSession]:
    """Return up to 25 sessions for the user, newest first."""
    result = await db.execute(
        select(ResumeRefinementSession)
        .where(ResumeRefinementSession.user_id == user_id)
        .order_by(ResumeRefinementSession.created_at.desc())
        .limit(_RECENT_LIMIT)
    )
    return list(result.scalars().all())


async def get_active_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> ResumeRefinementSession | None:
    """Return the user's most recent active session, or None."""
    result = await db.execute(
        select(ResumeRefinementSession)
        .where(
            ResumeRefinementSession.user_id == user_id,
            ResumeRefinementSession.status == "active",
        )
        .order_by(ResumeRefinementSession.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def update_critique(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    improvement_targets: list[dict],
    tokens_in: int,
    tokens_out: int,
    cost_usd: Decimal,
) -> ResumeRefinementSession:
    """Persist the initial critique pass output."""
    session.improvement_targets = improvement_targets
    session.target_index = 0
    session.turn_count += 1
    session.total_tokens_in += tokens_in
    session.total_tokens_out += tokens_out
    session.total_cost_usd = (session.total_cost_usd or Decimal("0")) + cost_usd
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def update_pending_proposal(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    target_section: str | None,
    proposal: str | None,
    rationale: str | None,
    clarifying_question: str | None,
    tokens_in: int,
    tokens_out: int,
    cost_usd: Decimal,
) -> ResumeRefinementSession:
    """Set the pending AI proposal on the session and bump counters."""
    session.pending_target_section = target_section
    session.pending_proposal = proposal
    session.pending_rationale = rationale
    session.pending_clarifying_question = clarifying_question
    session.turn_count += 1
    session.total_tokens_in += tokens_in
    session.total_tokens_out += tokens_out
    session.total_cost_usd = (session.total_cost_usd or Decimal("0")) + cost_usd
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def apply_user_resolution(
    db: AsyncSession,
    session: ResumeRefinementSession,
    *,
    new_draft: str,
    advance_target: bool,
) -> ResumeRefinementSession:
    """Clear pending state, persist the new draft, optionally bump target_index."""
    session.current_draft = new_draft
    session.pending_target_section = None
    session.pending_proposal = None
    session.pending_rationale = None
    session.pending_clarifying_question = None
    if advance_target:
        session.target_index += 1
    session.turn_count += 1
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def mark_completed(
    db: AsyncSession,
    session: ResumeRefinementSession,
) -> ResumeRefinementSession:
    """Mark the session ``completed`` and stamp ``completed_at``."""
    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)
    session.pending_target_section = None
    session.pending_proposal = None
    session.pending_rationale = None
    session.pending_clarifying_question = None
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session


async def mark_abandoned(
    db: AsyncSession,
    session: ResumeRefinementSession,
) -> ResumeRefinementSession:
    """Mark the session ``abandoned`` (user explicitly walked away)."""
    session.status = "abandoned"
    session.completed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return session
