"""Repository for ``tutor_turn``. Queries only; tenant-scoped by ``user_id``."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tutor.tutor_turn import TutorTurn


async def list_by_session(
    db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID,
) -> list[TutorTurn]:
    """Turns for one session, ordered by ``seq``."""
    result = await db.execute(
        select(TutorTurn)
        .where(TutorTurn.session_id == session_id, TutorTurn.user_id == user_id)
        .order_by(TutorTurn.seq)
    )
    return list(result.scalars().all())


async def list_all_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[TutorTurn]:
    """Every turn the user owns, grouped by session then ``seq`` -- for export."""
    result = await db.execute(
        select(TutorTurn)
        .where(TutorTurn.user_id == user_id)
        .order_by(TutorTurn.session_id, TutorTurn.seq)
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, turn: TutorTurn) -> TutorTurn:
    db.add(turn)
    await db.flush()
    await db.refresh(turn)
    return turn
