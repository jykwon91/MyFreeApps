"""Data-access layer for resume_upload_jobs.

All queries are tenant-scoped on ``user_id`` — callers must never omit it.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.jobs.resume_upload_job import ResumeUploadJob

_RECENT_LIMIT = 25


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
    file_path: str,
    file_filename: str,
    file_content_type: str,
    file_size_bytes: int,
    status: str = "queued",
) -> ResumeUploadJob:
    """Insert a new resume upload job and return the persisted row."""
    job = ResumeUploadJob(
        user_id=user_id,
        profile_id=profile_id,
        file_path=file_path,
        file_filename=file_filename,
        file_content_type=file_content_type,
        file_size_bytes=file_size_bytes,
        status=status,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return job


async def get_by_id_for_user(
    db: AsyncSession,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ResumeUploadJob | None:
    """Return a single job scoped to the given user, or None."""
    result = await db.execute(
        select(ResumeUploadJob).where(
            ResumeUploadJob.id == job_id,
            ResumeUploadJob.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_recent_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[ResumeUploadJob]:
    """Return the most recent ``_RECENT_LIMIT`` jobs for a user, newest first."""
    result = await db.execute(
        select(ResumeUploadJob)
        .where(ResumeUploadJob.user_id == user_id)
        .order_by(ResumeUploadJob.created_at.desc())
        .limit(_RECENT_LIMIT)
    )
    return list(result.scalars().all())


async def update_status(
    db: AsyncSession,
    job: ResumeUploadJob,
    status: str,
    error_message: str | None = None,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> ResumeUploadJob:
    """Update the job status in-place. Returns the updated job."""
    job.status = status
    if error_message is not None:
        job.error_message = error_message
    if started_at is not None:
        job.started_at = started_at
    if completed_at is not None:
        job.completed_at = completed_at
    await db.flush()
    await db.refresh(job)
    return job
