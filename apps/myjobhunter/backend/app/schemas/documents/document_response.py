"""Read schema for a Document row."""
import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.documents.document_kind import DocumentKindLiteral


class DocumentResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    application_id: uuid.UUID | None
    title: str
    kind: DocumentKindLiteral
    body: str | None
    # MinIO object key is NEVER returned — use the /download endpoint instead.
    filename: str | None
    content_type: str | None
    size_bytes: int | None
    has_file: bool
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
