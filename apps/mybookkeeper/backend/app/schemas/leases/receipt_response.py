"""Response schemas for rent receipt endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel


class SendReceiptResponse(BaseModel):
    receipt_number: str
    attachment_id: uuid.UUID


class PendingReceiptResponse(BaseModel):
    id: uuid.UUID
    transaction_id: uuid.UUID
    applicant_id: uuid.UUID
    signed_lease_id: uuid.UUID | None = None
    period_start_date: date
    period_end_date: date
    status: str
    sent_at: datetime | None = None
    sent_via_attachment_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PendingReceiptListResponse(BaseModel):
    items: list[PendingReceiptResponse]
    total: int
    pending_count: int
