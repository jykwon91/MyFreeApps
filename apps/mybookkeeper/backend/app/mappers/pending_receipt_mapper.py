"""Map an open receipt's list row to the API item."""
from __future__ import annotations

from app.schemas.leases.pending_receipt_list_row import PendingReceiptListRow
from app.schemas.leases.receipt_response import PendingReceiptResponse
from app.schemas.leases.receipt_send_blocker import ReceiptSendBlocker


def to_pending_receipt_response(
    row: PendingReceiptListRow,
    *,
    send_blocker: ReceiptSendBlocker | None,
    sent_from_other_gmail: str | None,
) -> PendingReceiptResponse:
    return PendingReceiptResponse(
        id=row.id,
        transaction_id=row.transaction_id,
        applicant_id=row.applicant_id,
        signed_lease_id=row.signed_lease_id,
        period_start_date=row.period_start_date,
        period_end_date=row.period_end_date,
        status=row.status,
        sent_at=row.sent_at,
        sent_via_attachment_id=row.sent_via_attachment_id,
        created_at=row.created_at,
        # A teammate's tenant stays private to them, as tenants are elsewhere.
        tenant_name=None if send_blocker == "tenant_of_other_member" else row.tenant_name,
        amount=row.amount,
        transaction_date=row.transaction_date,
        payer_name=row.payer_name,
        payment_method=row.payment_method,
        vendor=row.vendor,
        send_blocker=send_blocker,
        sent_from_other_gmail=sent_from_other_gmail,
    )
