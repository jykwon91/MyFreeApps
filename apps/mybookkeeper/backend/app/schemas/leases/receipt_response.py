"""Response schemas for rent receipt endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.leases.receipt_gmail_state import ReceiptGmailState
from app.schemas.leases.receipt_send_blocker import ReceiptSendBlocker


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
    tenant_name: str | None = None
    amount: Decimal
    transaction_date: date
    payer_name: str | None = None
    payment_method: str | None = None
    vendor: str | None = None
    send_blocker: ReceiptSendBlocker | None = None


class PendingReceiptListResponse(BaseModel):
    items: list[PendingReceiptResponse]
    total: int
    pending_count: int
    gmail_state: ReceiptGmailState
