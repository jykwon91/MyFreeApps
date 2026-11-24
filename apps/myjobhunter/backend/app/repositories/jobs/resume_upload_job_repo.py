"""Data-access layer for resume_upload_jobs.

All queries are tenant-scoped on ``user_id`` — callers must never omit it.
The worker uses ``claim_next_queued`` which is intentionally NOT tenant-scoped;
it processes all users' queued jobs. Every other function must include user_id.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import or_, select, update
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
    """Insert a new resume upload job; the caller's transaction commits it."""
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


async def exists_for_file_path(db: AsyncSession, user_id: uuid.UUID, file_path: str) -> bool:
    """Whether the user has a job for the stored object at ``file_path``."""
    result = await db.execute(
        select(ResumeUploadJob.id).where(
            ResumeUploadJob.user_id == user_id,
            ResumeUploadJob.file_path == file_path,
        )
    )
    return result.first() is not None


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


async def list_processing(db: AsyncSession) -> list[ResumeUploadJob]:
    """Every job currently claimed ``processing``, oldest claim first.

    Read once at worker boot to find jobs whose worker was killed mid-parse.
    Not tenant-scoped, like ``claim_next_queued``.
    """
    result = await db.execute(
        select(ResumeUploadJob)
        .where(
            ResumeUploadJob.status == "processing",
            ResumeUploadJob.started_at.is_not(None),
        )
        .order_by(ResumeUploadJob.started_at.asc())
    )
    return list(result.scalars().all())


async def get_claimed_for_update(
    db: AsyncSession,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    started_at: datetime,
) -> ResumeUploadJob | None:
    """The job, locked until commit, if it is still ``processing`` under the claim made at ``started_at``.

    None when the job is gone, or was finished, failed or re-claimed while
    the worker waited on Claude.
    """
    result = await db.execute(
        select(ResumeUploadJob)
        .where(
            ResumeUploadJob.id == job_id,
            ResumeUploadJob.user_id == user_id,
            ResumeUploadJob.status == "processing",
            ResumeUploadJob.started_at == started_at,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
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


async def claim_next_queued(db: AsyncSession) -> ResumeUploadJob | None:
    """Atomically transition one queued job to ``processing`` and return it.

    Uses ``UPDATE ... WHERE id = (subquery) RETURNING *`` so only one worker
    process can claim a given job even when multiple replicas run concurrently.
    The subquery selects the oldest queued job via ``ORDER BY created_at LIMIT 1``
    with ``FOR UPDATE SKIP LOCKED`` for safe concurrent access. A job waiting
    out a retry backoff (``next_retry_at`` in the future) is not claimable yet.

    Returns ``None`` when no queued jobs are due.
    """
    now = datetime.now(timezone.utc)
    # Subquery: pick the oldest due queued job id, skip rows locked by other workers.
    subq = (
        select(ResumeUploadJob.id)
        .where(
            ResumeUploadJob.status == "queued",
            or_(ResumeUploadJob.next_retry_at.is_(None), ResumeUploadJob.next_retry_at <= now),
        )
        .order_by(ResumeUploadJob.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
        .scalar_subquery()
    )
    stmt = (
        update(ResumeUploadJob)
        .where(ResumeUploadJob.id == subq)
        .values(status="processing", started_at=now, updated_at=now)
        .returning(ResumeUploadJob)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is not None:
        await db.commit()
    return row


async def mark_complete(
    db: AsyncSession,
    job: ResumeUploadJob,
    result_parsed_fields: dict,
    parser_version: str,
) -> ResumeUploadJob:
    """Mark a job as complete with parsed fields."""
    now = datetime.now(timezone.utc)
    job.status = "complete"
    job.result_parsed_fields = result_parsed_fields
    job.parser_version = parser_version
    job.completed_at = now
    job.error_message = None
    await db.flush()
    await db.commit()
    await db.refresh(job)
    return job


async def schedule_retry(
    db: AsyncSession,
    job: ResumeUploadJob,
    *,
    next_retry_at: datetime,
    error_message: str,
) -> ResumeUploadJob:
    """Put a job that hit a temporary failure back on the queue, due at ``next_retry_at``."""
    job.status = "queued"
    job.started_at = None
    job.retry_count += 1
    job.next_retry_at = next_retry_at
    job.error_message = error_message[:1000]
    await db.flush()
    await db.commit()
    await db.refresh(job)
    return job


async def mark_failed(
    db: AsyncSession,
    job: ResumeUploadJob,
    error_message: str,
) -> ResumeUploadJob:
    """Mark a job as failed with an error message."""
    now = datetime.now(timezone.utc)
    job.status = "failed"
    job.error_message = error_message[:1000]
    job.completed_at = now
    await db.flush()
    await db.commit()
    await db.refresh(job)
    return job


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
