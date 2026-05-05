"""Data-access layer for resume_refinement_turns.

Turns are append-only — once written they're never updated. Each user
or AI action in a session writes a new row.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume_refinement.turn import ResumeRefinementTurn


async def append(
    db: AsyncSession,
    *,
    session_id: uuid.UUID,
    turn_index: int,
    role: str,
    target_section: str | None = None,
    proposed_text: str | None = None,
    user_text: str | None = None,
    rationale: str | None = None,
    clarifying_question: str | None = None,
    draft_after: str | None = None,
    tokens_in: int = 0,
    tokens_out: int = 0,
) -> ResumeRefinementTurn:
    """Insert one turn row and return it."""
    turn = ResumeRefinementTurn(
        session_id=session_id,
        turn_index=turn_index,
        role=role,
        target_section=target_section,
        proposed_text=proposed_text,
        user_text=user_text,
        rationale=rationale,
        clarifying_question=clarifying_question,
        draft_after=draft_after,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
    )
    db.add(turn)
    await db.flush()
    await db.commit()
    await db.refresh(turn)
    return turn


async def list_for_session(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> list[ResumeRefinementTurn]:
    """Return every turn for a session, oldest first."""
    result = await db.execute(
        select(ResumeRefinementTurn)
        .where(ResumeRefinementTurn.session_id == session_id)
        .order_by(ResumeRefinementTurn.turn_index.asc())
    )
    return list(result.scalars().all())
