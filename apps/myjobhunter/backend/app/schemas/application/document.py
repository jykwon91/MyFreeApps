"""Document schemas — Phase 2."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentRead(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID | None = None
    title: str
    kind: str
    body: str | None = None
    file_path: str | None = None
    filename: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
