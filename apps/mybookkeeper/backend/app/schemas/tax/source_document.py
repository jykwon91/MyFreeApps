"""Schemas for the source documents endpoint."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class TaxSourceDocument(BaseModel):
    document_id: uuid.UUID
    file_name: str | None
    document_type: str
    issuer_name: str | None
    issuer_ein: str | None
    tax_year: int
    key_amount: float | None
    source: str
    uploaded_at: datetime
    form_instance_id: uuid.UUID


class ChecklistItem(BaseModel):
    expected_type: str
    expected_from: str | None
    reason: str
    status: str  # "received" | "missing"
    document_id: uuid.UUID | None = None


class SourceDocumentsResponse(BaseModel):
    documents: list[TaxSourceDocument]
    checklist: list[ChecklistItem]
