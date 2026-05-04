"""Resume upload and job-status routes.

POST /resumes                         — multipart upload; returns the created job
GET  /resume-upload-jobs              — list user's recent jobs (last 25)
GET  /resume-upload-jobs/{id}         — single job status
GET  /resume-upload-jobs/{id}/download — JSON with presigned download URL

All routes require authentication. All reads are tenant-scoped on user_id.
Raw MinIO object keys are never returned — use the /download endpoint.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.jobs.resume_upload_job_response import ResumeUploadJobResponse
from app.services.jobs.resume_upload_service import (
    create_upload,
    get_status,
    list_recent,
    presigned_download_url,
)
from app.services.jobs.resume_validator import ResumeRejected
from app.services.profile.profile_service import get_or_create_profile

router = APIRouter()

_NOT_FOUND_JOB = "Resume upload job not found"


@router.post("/resumes", response_model=ResumeUploadJobResponse, status_code=201)
async def upload_resume(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ResumeUploadJobResponse:
    """Accept a resume file upload, store it in MinIO, and queue a parse job."""
    content = await file.read()
    profile = await get_or_create_profile(db, user.id)

    try:
        job = await create_upload(
            file_bytes=content,
            filename=file.filename or "resume",
            content_type=file.content_type or "",
            user_id=user.id,
            profile_id=profile.id,
            db=db,
        )
    except ResumeRejected as exc:
        msg = str(exc)
        if "exceeds" in msg:
            raise HTTPException(status_code=413, detail=msg) from exc
        raise HTTPException(status_code=415, detail=msg) from exc

    return ResumeUploadJobResponse.model_validate(job)


@router.get("/resume-upload-jobs", response_model=list[ResumeUploadJobResponse])
async def list_resume_jobs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[ResumeUploadJobResponse]:
    """Return the user's 25 most recent resume upload jobs."""
    jobs = await list_recent(user.id, db)
    return [ResumeUploadJobResponse.model_validate(j) for j in jobs]


@router.get("/resume-upload-jobs/{job_id}", response_model=ResumeUploadJobResponse)
async def get_resume_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ResumeUploadJobResponse:
    """Return a single resume upload job. 404 if not found or not owned by caller."""
    job = await get_status(job_id, user.id, db)
    if job is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_JOB)
    return ResumeUploadJobResponse.model_validate(job)


@router.get("/resume-upload-jobs/{job_id}/download")
async def get_resume_download_url(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict[str, str]:
    """Return a short-lived presigned URL for downloading the resume file.

    Returns ``{"url": "<presigned URL>"}`` rather than a 302 redirect so
    the frontend can trigger a browser download without CORS pre-flight issues.
    Valid for 1 hour.
    """
    url = await presigned_download_url(job_id, user.id, db)
    if url is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_JOB)
    return {"url": url}
