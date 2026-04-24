"""JobBoardCredential repository — Phase 1 stub."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integration.job_board_credential import JobBoardCredential


async def get_by_id(db: AsyncSession, credential_id: uuid.UUID, user_id: uuid.UUID) -> JobBoardCredential | None:
    result = await db.execute(
        select(JobBoardCredential).where(JobBoardCredential.id == credential_id, JobBoardCredential.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[JobBoardCredential]:
    result = await db.execute(
        select(JobBoardCredential).where(JobBoardCredential.user_id == user_id)
    )
    return list(result.scalars().all())
