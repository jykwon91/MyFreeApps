import uuid
from datetime import datetime

from pydantic import BaseModel


class ExtractionRead(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    status: str = "processing"
    error_message: str | None = None
    confidence: str | None = None
    document_type: str = "invoice"
    model_version: str | None = None
    tokens_used: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}
