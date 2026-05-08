"""Internal schema populated by the file-upload service after MinIO storage.

Never instantiated from API input — the route handler passes individual kwargs
directly to ``document_service.create_file_document``.  This type exists so
callers that need to forward file metadata between layers have a typed
container rather than a loose dict.
"""
import uuid

from pydantic import BaseModel

from app.schemas.documents.document_kind import DocumentKindLiteral


class DocumentFileCreateInternal(BaseModel):
    title: str
    kind: DocumentKindLiteral
    application_id: uuid.UUID | None = None
    file_path: str
    filename: str
    content_type: str
    size_bytes: int

    model_config = {"extra": "forbid"}
