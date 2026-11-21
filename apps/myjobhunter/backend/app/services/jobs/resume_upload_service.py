"""Business logic for resume upload jobs.

Validates the uploaded bytes, persists them to MinIO, and creates a
``resume_upload_jobs`` row with ``status='queued'``. A Phase 3 Dramatiq
worker will pick up queued rows and run the actual parse.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.schemas.storage.new_stored_object import NewStoredObject
from platform_shared.services.storage.committed_write_guard import CommittedWriteGuard
from platform_shared.services.storage.object_upload import upload_objects
from platform_shared.services.storage.rows_present import RowsPresent

from app.core.config import settings
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.models.jobs.resume_upload_job import ResumeUploadJob
from app.repositories.jobs import resume_upload_job_repo
from app.services.jobs.resume_validator import ResumeRejected, validate_resume

# Presigned URL TTL: 1 hour, matching MBK's pattern.
_PRESIGNED_URL_TTL_SECONDS = 3600

# MinIO key prefix for resumes.
_RESUME_KEY_PREFIX = "resumes"


async def create_upload(
    *,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
) -> ResumeUploadJob:
    """Validate, upload to MinIO, and queue a resume parse job.

    The file is stored before the job row is written, in a transaction this
    function owns, so it can tell a failed write (the object is removed) from a
    COMMIT that raised (the object is kept unless the row is surely absent).

    Args:
        file_bytes: Raw bytes read from the multipart upload.
        filename: Original filename from the upload (used as the MinIO key suffix).
        content_type: Content-Type header from the multipart part.
        user_id: ID of the authenticated user.
        profile_id: ID of the user's profile (FK on resume_upload_jobs).

    Returns:
        The newly created ``ResumeUploadJob`` row with ``status='queued'``.

    Raises:
        ResumeRejected: on size or type validation failure (caller maps to 413/415).
    """
    # Validate size, content-type allowlist, and magic bytes.
    sniffed_type = validate_resume(
        file_bytes,
        content_type,
        max_bytes=settings.max_resume_upload_bytes,
    )

    # Upload to MinIO. Key pattern: resumes/{uuid}/{filename}
    storage = get_storage()
    key = storage.generate_key(_RESUME_KEY_PREFIX, filename)
    await upload_objects(storage, [NewStoredObject(key, file_bytes, sniffed_type)])

    # A new row has nothing to wait on, so "not there" after a failed COMMIT
    # isn't conclusive and the object is then kept.
    async with CommittedWriteGuard(
        storage, [key], _job_present_check(user_id, key), absence_conclusive=False,
    ) as guard:
        async with unit_of_work() as db:
            job = await resume_upload_job_repo.create(
                db,
                user_id=user_id,
                profile_id=profile_id,
                file_path=key,
                file_filename=filename,
                file_content_type=sniffed_type,
                file_size_bytes=len(file_bytes),
                status="queued",
            )
            guard.rows_written()

    return job


def _job_present_check(user_id: uuid.UUID, key: str) -> RowsPresent:
    async def rows_present() -> bool:
        async with unit_of_work() as db:
            return await resume_upload_job_repo.exists_for_file_path(db, user_id, key)

    return rows_present


async def get_status(
    job_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> ResumeUploadJob | None:
    """Return the job row for the given user, or None if not found."""
    return await resume_upload_job_repo.get_by_id_for_user(db, job_id, user_id)


async def list_recent(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> list[ResumeUploadJob]:
    """Return the user's most recent 25 resume upload jobs."""
    return await resume_upload_job_repo.list_recent_for_user(db, user_id)


async def presigned_download_url(
    job_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> str | None:
    """Return a presigned download URL for the resume, or None if not found.

    The URL is signed against ``minio_public_endpoint`` (via
    ``_DualEndpointStorageClient``) so the browser can fetch it directly.
    Valid for 1 hour.
    """
    job = await resume_upload_job_repo.get_by_id_for_user(db, job_id, user_id)
    if job is None:
        return None
    storage = get_storage()
    return storage.generate_presigned_url(job.file_path, _PRESIGNED_URL_TTL_SECONDS)
