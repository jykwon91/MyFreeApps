"""Create request schema for a Document.

Two creation modes are supported:
1. Text-body — ``body`` is required, ``file_path`` is left empty (frontend
   sends JSON to POST /documents).
2. File upload — ``filename``, ``content_type``, ``size_bytes``, and
   ``file_path`` (the MinIO key) are populated by the service after
   the multipart upload is stored.

At the HTTP layer the route handler reads the multipart fields and builds
this schema internally; callers never send ``file_path`` directly.
"""
import uuid

from pydantic import BaseModel, Field, model_validator

from app.core.document_limits import (
    DOCUMENT_CONTENT_TYPE_MAX_LEN,
    DOCUMENT_FILENAME_MAX_LEN,
    DOCUMENT_TITLE_MAX_LEN,
)
from app.schemas.documents.document_kind import DocumentKindLiteral


class DocumentCreateRequest(BaseModel):
    title: str = Field(max_length=DOCUMENT_TITLE_MAX_LEN)
    kind: DocumentKindLiteral
    application_id: uuid.UUID | None = None
    # Text body — required for text-only documents.
    body: str | None = None
    # File metadata — set by the service layer, never by the caller.
    file_path: str | None = None
    filename: str | None = Field(default=None, max_length=DOCUMENT_FILENAME_MAX_LEN)
    content_type: str | None = Field(default=None, max_length=DOCUMENT_CONTENT_TYPE_MAX_LEN)
    size_bytes: int | None = None

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def _require_body_or_file(self) -> "DocumentCreateRequest":
        has_body = bool(self.body)
        has_file = bool(self.file_path)
        if not has_body and not has_file:
            raise ValueError("either body or a file upload is required")
        return self
