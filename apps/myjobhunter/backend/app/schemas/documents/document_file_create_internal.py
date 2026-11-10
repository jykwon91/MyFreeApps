"""Internal schema populated by the file-upload service after MinIO storage.

Never instantiated from API input — the route handler passes individual kwargs
directly to ``document_service.create_file_document``.  This type exists so
callers that need to forward file metadata between layers have a typed
container rather than a loose dict.
"""
import uuid

from pydantic import BaseModel, Field

from app.core.document_limits import (
    DOCUMENT_CONTENT_TYPE_MAX_LEN,
    DOCUMENT_FILENAME_MAX_LEN,
    DOCUMENT_TITLE_MAX_LEN,
)
from app.schemas.documents.document_kind import DocumentKindLiteral


class DocumentFileCreateInternal(BaseModel):
    title: str = Field(max_length=DOCUMENT_TITLE_MAX_LEN)
    kind: DocumentKindLiteral
    application_id: uuid.UUID | None = None
    file_path: str
    filename: str = Field(max_length=DOCUMENT_FILENAME_MAX_LEN)
    content_type: str = Field(max_length=DOCUMENT_CONTENT_TYPE_MAX_LEN)
    size_bytes: int

    model_config = {"extra": "forbid"}
