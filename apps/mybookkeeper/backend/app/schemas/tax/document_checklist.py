"""Schemas for the personalized document checklist endpoint."""
import uuid

from pydantic import BaseModel


class ChecklistItem(BaseModel):
    category: str  # "property_insurance", "property_tax", "mortgage_1098", "w2", "1099_int", etc.
    description: str  # Human-readable: "Insurance policy for 6738 Peerless St"
    property_name: str | None  # If property-specific
    expected_vendor: str | None  # Expected issuer/employer
    status: str  # "received" | "missing"
    document_ids: list[uuid.UUID]  # IDs of matching documents found


class DocumentChecklist(BaseModel):
    tax_year: int
    items: list[ChecklistItem]
    received_count: int
    total_count: int
