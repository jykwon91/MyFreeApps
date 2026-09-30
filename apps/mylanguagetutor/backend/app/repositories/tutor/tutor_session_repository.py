"""Repository for ``tutor_session``. Queries only; tenant-scoped by ``user_id``.

Every read takes ``user_id`` and filters on it -- another user's session is
indistinguishable from a missing one (callers map ``None`` to 404).
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tutor.tutor_session import TutorSession


async def get_by_id(
    db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID,
) -> TutorSession | None:
    result = await db.execute(
        select(TutorSession).where(
            TutorSession.id == session_id, TutorSession.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_by_user(
    db: AsyncSession, user_id: uuid.UUID, *, limit: int, offset: int,
) -> list[TutorSession]:
    """The user's sessions, newest first. ``id`` breaks created_at ties so
    pagination is stable."""
    result = await db.execute(
        select(TutorSession)
        .where(TutorSession.user_id == user_id)
        .order_by(TutorSession.created_at.desc(), TutorSession.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def count_by_user(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(TutorSession).where(
            TutorSession.user_id == user_id,
        )
    )
    return int(result.scalar_one())


async def list_all_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[TutorSession]:
    """Every session for the user, oldest first -- for the data export."""
    result = await db.execute(
        select(TutorSession)
        .where(TutorSession.user_id == user_id)
        .order_by(TutorSession.created_at, TutorSession.id)
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, session: TutorSession) -> TutorSession:
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def delete(db: AsyncSession, session: TutorSession) -> None:
    """Delete a session; its turns go with it via FK ON DELETE CASCADE."""
    await db.delete(session)
    await db.flush()
