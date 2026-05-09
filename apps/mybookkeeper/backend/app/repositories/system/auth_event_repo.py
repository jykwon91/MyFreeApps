import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories.auth_event_repo import list_filtered  # noqa: F401

from app.models.system.auth_event import AuthEvent


async def list_by_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    limit: int = 100,
) -> Sequence[AuthEvent]:
    result = await db.execute(
        select(AuthEvent)
        .where(AuthEvent.user_id == user_id)
        .order_by(AuthEvent.created_at.desc())
        .limit(limit),
    )
    return result.scalars().all()


async def count_recent_failures(
    db: AsyncSession,
    user_id: uuid.UUID,
    since: datetime,
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(AuthEvent)
        .where(
            and_(
                AuthEvent.user_id == user_id,
                AuthEvent.succeeded == False,  # noqa: E712
                AuthEvent.created_at >= since,
            ),
        ),
    )
    return result.scalar_one()
