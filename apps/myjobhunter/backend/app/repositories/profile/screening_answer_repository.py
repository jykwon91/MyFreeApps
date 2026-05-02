"""Repository for ``screening_answers`` — owns every query against the table.

The UNIQUE constraint is on (user_id, question_key). IntegrityError is caught at
the service layer and raised as ``DuplicateScreeningAnswerError``.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile.screening_answer import ScreeningAnswer

_UPDATABLE_COLUMNS: frozenset[str] = frozenset({"answer"})


async def get_by_id(
    db: AsyncSession, answer_id: uuid.UUID, user_id: uuid.UUID,
) -> ScreeningAnswer | None:
    result = await db.execute(
        select(ScreeningAnswer).where(
            ScreeningAnswer.id == answer_id,
            ScreeningAnswer.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[ScreeningAnswer]:
    result = await db.execute(
        select(ScreeningAnswer)
        .where(ScreeningAnswer.user_id == user_id)
        .order_by(ScreeningAnswer.question_key.asc())
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, answer: ScreeningAnswer) -> ScreeningAnswer:
    db.add(answer)
    await db.flush()
    await db.refresh(answer)
    return answer


async def update(
    db: AsyncSession,
    answer: ScreeningAnswer,
    updates: dict[str, Any],
) -> ScreeningAnswer:
    safe_fields = {k: v for k, v in updates.items() if k in _UPDATABLE_COLUMNS}
    for key, value in safe_fields.items():
        setattr(answer, key, value)
    await db.flush()
    await db.refresh(answer)
    return answer


async def delete(db: AsyncSession, answer: ScreeningAnswer) -> None:
    await db.delete(answer)
    await db.flush()
