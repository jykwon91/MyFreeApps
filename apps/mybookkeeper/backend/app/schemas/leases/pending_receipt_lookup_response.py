"""One payment's open receipt, for a screen that opens a single receipt."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.leases.receipt_gmail_state import ReceiptGmailState
from app.schemas.leases.receipt_response import PendingReceiptResponse


class PendingReceiptLookupResponse(BaseModel):
    # None when the payment has no receipt waiting: sent, dismissed, or never queued.
    item: PendingReceiptResponse | None
    gmail_state: ReceiptGmailState
