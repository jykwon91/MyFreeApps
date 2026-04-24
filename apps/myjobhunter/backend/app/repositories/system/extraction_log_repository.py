"""ExtractionLog repository — Phase 1 stub."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.extraction_log import ExtractionLog


async def get_by_id(db: AsyncSession, log_id: uuid.UUID, user_id: uuid.UUID) -> ExtractionLog | None:
    result = await db.execute(
        select(ExtractionLog).where(ExtractionLog.id == log_id, ExtractionLog.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[ExtractionLog]:
    result = await db.execute(
        select(ExtractionLog).where(ExtractionLog.user_id == user_id)
    )
    return list(result.scalars().all())
