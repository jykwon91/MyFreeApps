"""Schema for the text-only document creation route (POST /documents JSON body)."""
import uuid

from pydantic import BaseModel, field_validator

from app.schemas.documents.document_kind import DocumentKindLiteral


class DocumentTextCreateRequest(BaseModel):
    title: str
    kind: DocumentKindLiteral
    application_id: uuid.UUID | None = None
    body: str

    model_config = {"extra": "forbid"}

    @field_validator("body")
    @classmethod
    def _body_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("body must not be empty")
        return v
