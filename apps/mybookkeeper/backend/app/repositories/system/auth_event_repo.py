import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

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


async def list_filtered(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    event_type: str | None = None,
    since: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> Sequence[AuthEvent]:
    filters: list = []
    if user_id is not None:
        filters.append(AuthEvent.user_id == user_id)
    if event_type is not None:
        filters.append(AuthEvent.event_type == event_type)
    if since is not None:
        filters.append(AuthEvent.created_at >= since)

    query = (
        select(AuthEvent)
        .order_by(AuthEvent.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if filters:
        query = query.where(and_(*filters))

    result = await db.execute(query)
    return result.scalars().all()
