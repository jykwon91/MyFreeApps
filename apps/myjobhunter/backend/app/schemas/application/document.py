"""Document schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentRead(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    document_type: str
    generated_by: str
    version: int
    created_at: datetime

    model_config = {"from_attributes": True}
