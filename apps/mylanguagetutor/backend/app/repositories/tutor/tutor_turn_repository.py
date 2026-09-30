"""Repository for ``tutor_turn``. Queries only; tenant-scoped by ``user_id``."""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.turn_status import TurnStatus
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


async def get_by_id(
    db: AsyncSession, turn_id: uuid.UUID, user_id: uuid.UUID,
) -> TutorTurn | None:
    result = await db.execute(
        select(TutorTurn).where(TutorTurn.id == turn_id, TutorTurn.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def next_seq(db: AsyncSession, session_id: uuid.UUID) -> int:
    """``max(seq) + 1`` for the session (1 for the first turn). Call with the
    session row locked (``get_by_id_for_update``) so concurrent turns can't
    race to the same value."""
    result = await db.execute(
        select(func.coalesce(func.max(TutorTurn.seq), 0)).where(
            TutorTurn.session_id == session_id,
        )
    )
    return int(result.scalar_one()) + 1


async def list_recent_answered(
    db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID, *, limit: int,
) -> list[TutorTurn]:
    """The last ``limit`` turns that got a reply (complete or partial), oldest
    first -- the conversation history replayed to the tutor."""
    result = await db.execute(
        select(TutorTurn)
        .where(
            TutorTurn.session_id == session_id,
            TutorTurn.user_id == user_id,
            TutorTurn.status != TurnStatus.FAILED.value,
            TutorTurn.reply_text.is_not(None),
        )
        .order_by(TutorTurn.seq.desc())
        .limit(limit)
    )
    return list(reversed(result.scalars().all()))
