import uuid
from dataclasses import dataclass

from app.models.integrations.integration import Integration
from app.models.leases.pending_rent_receipt import PendingRentReceipt


@dataclass(frozen=True)
class ReceiptSendContext:
    receipt: PendingRentReceipt
    tenant_name: str | None
    tenant_email: str
    property_address: str
    lease_id: uuid.UUID
    integration: Integration
    landlord_name: str
    from_address: str
