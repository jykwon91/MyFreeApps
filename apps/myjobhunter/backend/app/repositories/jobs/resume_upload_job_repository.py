"""ResumeUploadJob repository — Phase 1 stub."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.jobs.resume_upload_job import ResumeUploadJob


async def get_by_id(db: AsyncSession, job_id: uuid.UUID, user_id: uuid.UUID) -> ResumeUploadJob | None:
    result = await db.execute(
        select(ResumeUploadJob).where(ResumeUploadJob.id == job_id, ResumeUploadJob.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[ResumeUploadJob]:
    result = await db.execute(
        select(ResumeUploadJob).where(ResumeUploadJob.user_id == user_id)
    )
    return list(result.scalars().all())
