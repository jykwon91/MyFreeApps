"""Pydantic response schema for resume_upload_jobs rows."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ResumeUploadJobResponse(BaseModel):
    """API-facing representation of a resume_upload_jobs row.

    Never exposes ``file_path`` (the raw MinIO key) — callers must use
    the ``/resume-upload-jobs/{id}/download`` endpoint to get a presigned URL.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    profile_id: uuid.UUID
    file_filename: str | None
    file_content_type: str | None
    file_size_bytes: int | None
    status: str
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
