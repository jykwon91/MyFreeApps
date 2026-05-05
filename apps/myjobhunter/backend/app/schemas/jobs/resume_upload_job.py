"""ResumeUploadJob schemas."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class ResumeJobParsedFields(BaseModel):
    """Summary of what the resume parser extracted — stored in result_parsed_fields."""
    summary: str | None = None
    headline: str | None = None
    work_history_count: int = 0
    education_count: int = 0
    skills_count: int = 0


class ResumeUploadJobRead(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    file_filename: str | None = None
    file_content_type: str | None = None
    file_size_bytes: int | None = None
    status: str
    retry_count: int
    error_message: str | None = None
    result_parsed_fields: ResumeJobParsedFields | None = None
    parser_version: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
