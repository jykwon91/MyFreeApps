"""Read-only queries that gather a user's rows for the data export."""
import uuid
from typing import Any, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume_refinement.session import ResumeRefinementSession
from app.models.resume_refinement.turn import ResumeRefinementTurn

_Model = TypeVar("_Model")


async def list_for_user(db: AsyncSession, model: type[_Model], user_id: uuid.UUID) -> list[_Model]:
    """Every row of ``model`` owned by ``user_id`` (``model`` must have a ``user_id`` column)."""
    user_id_column: Any = model.user_id  # type: ignore[attr-defined]
    result = await db.execute(select(model).where(user_id_column == user_id))
    return list(result.scalars().all())


async def list_refinement_turns_for_user(
    db: AsyncSession, user_id: uuid.UUID,
) -> list[ResumeRefinementTurn]:
    """Every refinement turn belonging to the user's sessions (turns carry no ``user_id``)."""
    result = await db.execute(
        select(ResumeRefinementTurn)
        .join(ResumeRefinementSession, ResumeRefinementTurn.session_id == ResumeRefinementSession.id)
        .where(ResumeRefinementSession.user_id == user_id)
        .order_by(ResumeRefinementTurn.session_id, ResumeRefinementTurn.turn_index)
    )
    return list(result.scalars().all())
