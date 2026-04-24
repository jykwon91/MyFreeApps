"""ResumeUploadJob service — Phase 1 stub.

Worker implementation added in Phase 2 alongside Dramatiq setup.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.jobs.resume_upload_job import ResumeUploadJob
from app.repositories.jobs import resume_upload_job_repository


async def list_jobs(db: AsyncSession, user_id: uuid.UUID) -> list[ResumeUploadJob]:
    return await resume_upload_job_repository.list_by_user(db, user_id)
