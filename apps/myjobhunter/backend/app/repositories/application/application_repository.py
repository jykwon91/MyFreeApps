"""Application repository — Phase 1 stub."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application


async def get_by_id(db: AsyncSession, application_id: uuid.UUID, user_id: uuid.UUID) -> Application | None:
    result = await db.execute(
        select(Application).where(Application.id == application_id, Application.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Application]:
    result = await db.execute(
        select(Application).where(Application.user_id == user_id, Application.deleted_at.is_(None))
    )
    return list(result.scalars().all())
