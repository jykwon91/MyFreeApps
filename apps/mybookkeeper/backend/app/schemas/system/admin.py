import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


DocumentType = Literal[
    "invoice", "statement", "lease", "insurance_policy", "tax_form",
    "contract", "year_end_statement", "receipt", "other",
    "w2", "1099", "1099_int", "1099_div", "1099_b", "1099_k",
    "1099_misc", "1099_nec", "1099_r", "1098", "k1",
]


class PlatformStats(BaseModel):
    total_users: int
    active_users: int
    inactive_users: int
    total_organizations: int
    total_transactions: int
    total_documents: int


class AdminOrgRead(BaseModel):
    id: uuid.UUID
    name: str
    created_by: uuid.UUID
    owner_email: str | None
    created_at: datetime
    member_count: int
    transaction_count: int


class CleanReExtractRequest(BaseModel):
    organization_id: uuid.UUID
    document_type: DocumentType
    tax_year: int | None = None


class CleanReExtractResponse(BaseModel):
    documents_found: int
    transactions_deleted: int
    extractions_deleted: int
    documents_reset: int
