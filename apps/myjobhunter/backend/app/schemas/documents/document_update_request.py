"""Partial update request schema for a Document.

PATCH allows updating ``title``, ``body``, ``kind``, and ``application_id``.
File content cannot be replaced — create a new document instead.
All fields are optional; omitting them leaves the existing value unchanged.
"""
import uuid

from pydantic import BaseModel

from app.schemas.documents.document_kind import DocumentKindLiteral


class DocumentUpdateRequest(BaseModel):
    title: str | None = None
    kind: DocumentKindLiteral | None = None
    body: str | None = None
    application_id: uuid.UUID | None = None

    model_config = {"extra": "forbid"}

    def to_update_dict(self) -> dict:
        """Return only the explicitly-set fields as a plain dict."""
        return {
            field: value
            for field, value in self.model_dump().items()
            if value is not None
        }
