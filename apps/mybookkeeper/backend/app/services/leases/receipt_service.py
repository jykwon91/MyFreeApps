"""Rent receipt queue: create, list, dismiss and preview pending receipts.

Sending lives in ``receipt_send_service``.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.leases import (
    pending_rent_receipt_repo,
)
from app.repositories.transactions import transaction_repo
from app.repositories.user import user_repo
from app.repositories.inquiries import inquiry_repo
from app.services.leases.exceptions import (
    ReceiptSendInProgressError,
    ReceiptTransactionNotAttributedError,
)
from app.services.leases.receipt_address_resolver import resolve_property_address
from app.services.leases.receipt_formatting import (
    resolve_landlord_name as _resolve_landlord_name,
)
from app.services.leases.receipt_pdf_service import ReceiptData, generate_receipt_pdf
from app.services.leases.receipt_period_resolver import resolve_lease_and_period

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

async def create_pending_receipt_in_session(
    db: AsyncSession,
    *,
    transaction_id: uuid.UUID,
    applicant_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    period_start_date: _dt.date | None = None,
    period_end_date: _dt.date | None = None,
) -> None:
    """Path B — create a pending receipt row in the caller's session.

    Idempotent on ``transaction_id`` — safe to call multiple times.
    The caller owns the commit; the receipt insert is part of the same
    transaction as the attribution that produced it. Used by
    ``attribution_service`` so the receipt and the applicant_id mutation
    land atomically.
    """
    txn = await transaction_repo.get_by_id(db, transaction_id, organization_id)
    if not txn:
        return  # transaction disappeared; nothing to do

    signed_lease_id, start, end = await resolve_lease_and_period(
        db,
        user_id=user_id,
        organization_id=organization_id,
        applicant_id=applicant_id,
        txn_date=txn.transaction_date,
        period_start_date=period_start_date,
        period_end_date=period_end_date,
    )

    await pending_rent_receipt_repo.create_idempotent(
        db,
        user_id=user_id,
        organization_id=organization_id,
        transaction_id=transaction_id,
        applicant_id=applicant_id,
        signed_lease_id=signed_lease_id,
        period_start_date=start,
        period_end_date=end,
    )


async def create_pending_receipt_from_attribution(
    *,
    transaction_id: uuid.UUID,
    applicant_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    period_start_date: _dt.date | None = None,
    period_end_date: _dt.date | None = None,
) -> None:
    """Top-level wrapper — opens its own session.

    Used by test seeds that need to create a pending receipt outside any
    existing transaction. Production attribution paths use
    ``create_pending_receipt_in_session`` instead so the receipt creation
    rides on the same commit as the applicant_id mutation.
    """
    async with unit_of_work() as db:
        await create_pending_receipt_in_session(
            db,
            transaction_id=transaction_id,
            applicant_id=applicant_id,
            user_id=user_id,
            organization_id=organization_id,
            period_start_date=period_start_date,
            period_end_date=period_end_date,
        )


async def count_pending_receipts(organization_id: uuid.UUID) -> int:
    async with AsyncSessionLocal() as db:
        return await pending_rent_receipt_repo.count_open(db, organization_id)


async def list_pending_receipts(
    *,
    organization_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
) -> list:
    async with AsyncSessionLocal() as db:
        return list(await pending_rent_receipt_repo.list_open(
            db, organization_id, limit=limit, offset=offset,
        ))


async def dismiss_pending_receipt(
    *,
    transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> None:
    """Path B — dismiss a pending receipt without sending."""
    async with unit_of_work() as db:
        dismissed = await pending_rent_receipt_repo.mark_dismissed_if_pending(
            db,
            transaction_id=transaction_id,
            organization_id=organization_id,
            dismissed_at=_dt.datetime.now(_dt.timezone.utc),
        )
        if dismissed:
            return
        pending = await pending_rent_receipt_repo.get_by_transaction_id(
            db, transaction_id, organization_id,
        )
    if pending is None:
        raise LookupError("No pending receipt found for this transaction")
    if pending.status == "sending":
        raise ReceiptSendInProgressError("This receipt is being sent; it can't be dismissed.")
    raise ValueError(f"Receipt is already {pending.status}")


async def preview_receipt_pdf(
    *,
    transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    period_start: _dt.date,
    period_end: _dt.date,
    payment_method: str | None,
) -> tuple[bytes, str]:
    """Generate a preview PDF without uploading or sending.

    Returns ``(pdf_bytes, filename)``.
    """
    async with AsyncSessionLocal() as db:
        txn = await transaction_repo.get_by_id(db, transaction_id, organization_id)
        if txn is None:
            raise LookupError(f"Transaction {transaction_id} not found")
        if txn.applicant_id is None:
            raise ReceiptTransactionNotAttributedError(
                "This transaction hasn't been attributed to a tenant."
            )

        applicant = await applicant_repo.get(
            db,
            applicant_id=txn.applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise LookupError(f"Applicant {txn.applicant_id} not found")

        tenant_email: str | None = None
        if applicant.inquiry_id is not None:
            inq = await inquiry_repo.get_by_id(db, applicant.inquiry_id, organization_id)
            if inq is not None:
                tenant_email = inq.inquirer_email

        property_address, _ = await resolve_property_address(
            db,
            applicant_id=txn.applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )

        host_user = await user_repo.get_by_id(db, user_id)
        landlord_name = _resolve_landlord_name(host_user) if host_user else "Landlord"

    receipt_data = ReceiptData(
        receipt_number="R-PREVIEW",
        receipt_date=_dt.date.today(),
        payer_name=applicant.legal_name or "Tenant",
        payer_email=tenant_email,
        landlord_name=landlord_name,
        property_address=property_address,
        period_start=period_start,
        period_end=period_end,
        amount=txn.amount,
        payment_method=payment_method or txn.payment_method,
    )
    pdf_bytes = generate_receipt_pdf(receipt_data)
    return pdf_bytes, "receipt-preview.pdf"
