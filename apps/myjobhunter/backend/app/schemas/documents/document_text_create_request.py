"""Schema for the text-only document creation route (POST /documents JSON body)."""
import uuid

from pydantic import BaseModel, Field, field_validator

from app.core.document_limits import DOCUMENT_TITLE_MAX_LEN
from app.schemas.documents.document_kind import DocumentKindLiteral


class DocumentTextCreateRequest(BaseModel):
    title: str = Field(max_length=DOCUMENT_TITLE_MAX_LEN)
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
