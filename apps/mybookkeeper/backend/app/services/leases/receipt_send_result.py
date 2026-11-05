import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class ReceiptSendResult:
    receipt_number: str
    attachment_id: uuid.UUID
