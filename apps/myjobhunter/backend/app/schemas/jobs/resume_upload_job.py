"""ResumeUploadJob schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class ResumeUploadJobRead(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    status: str
    retry_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
