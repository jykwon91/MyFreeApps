import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class Upload1099Request(BaseModel):
    source_type: str
    tax_year: int
    issuer: str | None = None
    reported_amount: Decimal


class CreateMatchRequest(BaseModel):
    reconciliation_source_id: uuid.UUID
    reservation_id: uuid.UUID
    matched_amount: Decimal


class ReconciliationSourceRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    document_id: uuid.UUID | None = None

    source_type: str
    tax_year: int
    issuer: str | None = None
    reported_amount: Decimal

    matched_amount: Decimal
    discrepancy: Decimal | None = None
    status: str = "unmatched"

    document_file_name: str | None = None
    property_name: str | None = None

    created_at: datetime

    model_config = {"from_attributes": True}


class ReconciliationMatchRead(BaseModel):
    id: uuid.UUID
    reconciliation_source_id: uuid.UUID
    reservation_id: uuid.UUID
    matched_amount: Decimal

    created_at: datetime

    model_config = {"from_attributes": True}


class AutoReconcileResponse(BaseModel):
    sources_checked: int
    auto_matched: int
    discrepancies: int
