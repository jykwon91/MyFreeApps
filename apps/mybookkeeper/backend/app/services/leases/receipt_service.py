"""Rent receipt orchestration service.

Flow for ``send_receipt``:
  1. Fetch the transaction, applicant, linked lease, integration, user.
  2. Atomically increment the receipt sequence to claim the next number.
  3. Generate the PDF bytes.
  4. Upload PDF to MinIO under ``signed-leases/<lease_id>/``.
  5. Insert a ``signed_lease_attachment`` row (kind=``rent_receipt``).
  6. Send the PDF via Gmail.
  7. Mark any ``pending_rent_receipts`` row as ``sent``.

Steps 4-5-7 happen inside a single ``unit_of_work`` transaction that wraps the
DB writes only. The Gmail call (step 6) is outside the DB transaction per the
established "send-first, persist-second" pattern from ``inquiry_reply_service``.

If Gmail send fails, the storage upload and DB rows are rolled back so no
orphaned attachment exists. The sequence number has already been consumed —
we accept a gap in the numbering sequence rather than risk two receipts having
the same number.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from calendar import monthrange
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import integration_repo
from app.repositories.applicants import applicant_repo
from app.repositories.leases import (
    pending_rent_receipt_repo,
    rent_receipt_sequence_repo,
    signed_lease_attachment_repo,
    signed_lease_repo,
)
from app.repositories.properties import property_repo
from app.repositories.listings import listing_repo
from app.repositories.transactions import transaction_repo
from app.repositories.user import user_repo
from app.repositories.inquiries import inquiry_repo
from app.services.email import gmail_service
from app.services.email.exceptions import (
    GmailReauthRequiredError,
    GmailSendError,
    GmailSendScopeError,
)
from app.services.integrations import integration_service
from app.services.leases.receipt_pdf_service import ReceiptData, generate_receipt_pdf
from app.core import storage as _storage_module

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Domain errors — mapped to HTTP status codes at the route level
# ---------------------------------------------------------------------------

class ReceiptMissingIntegrationError(Exception):
    """Host has no Gmail integration connected."""


class ReceiptMissingSendScopeError(Exception):
    """Gmail integration lacks gmail.send scope — host must reconnect."""


class ReceiptGmailReauthError(Exception):
    """Gmail token expired — host must reconnect Gmail."""


class ReceiptGmailSendError(Exception):
    """Gmail rejected the message for a non-auth reason."""


class ReceiptMissingApplicantEmailError(Exception):
    """Tenant has no email on file — can't send the receipt."""


class ReceiptTransactionNotAttributedError(Exception):
    """Transaction has no applicant_id — not a rent payment."""


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ReceiptSendResult:
    receipt_number: str
    attachment_id: uuid.UUID


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _default_period(txn_date: _dt.date) -> tuple[_dt.date, _dt.date]:
    """Return (start, end) for the full calendar month of ``txn_date``."""
    first = txn_date.replace(day=1)
    last_day = monthrange(txn_date.year, txn_date.month)[1]
    last = txn_date.replace(day=last_day)
    return first, last


async def _resolve_property_address(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> tuple[str, uuid.UUID | None]:
    """Walk applicant → signed_lease → listing → property to get the address.

    Returns ``(address_string, signed_lease_id)``.  The address is best-effort
    — if the chain is broken at any point, a fallback string is returned.
    """
    leases = await signed_lease_repo.list_for_tenant(
        db,
        user_id=user_id,
        organization_id=organization_id,
        applicant_id=applicant_id,
        include_deleted=False,
        limit=5,
    )
    for lease in leases:
        if not lease.listing_id:
            continue
        listing = await listing_repo.get_by_id(db, lease.listing_id, organization_id)
        if listing is None or not listing.property_id:
            continue
        prop = await property_repo.get_by_id(
            db, listing.property_id, organization_id=organization_id
        )
        if prop and prop.address:
            return prop.address, lease.id
    return "Address on file", None


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

async def create_pending_receipt_from_attribution(
    *,
    transaction_id: uuid.UUID,
    applicant_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    period_start_date: _dt.date | None = None,
    period_end_date: _dt.date | None = None,
) -> None:
    """Path B — create a pending receipt row when a transaction is attributed.

    Idempotent on ``transaction_id`` — safe to call multiple times.
    Called from ``attribution_service.maybe_attribute_payment`` and
    ``attribution_service.confirm_review``.
    """
    async with unit_of_work() as db:
        txn = await transaction_repo.get_by_id(db, transaction_id, organization_id)
        if txn is None:
            return  # transaction disappeared; nothing to do

        # Resolve the signed lease for this applicant (for the receipt queue)
        leases = await signed_lease_repo.list_for_tenant(
            db,
            user_id=user_id,
            organization_id=organization_id,
            applicant_id=applicant_id,
            include_deleted=False,
            limit=1,
        )
        signed_lease_id = leases[0].id if leases else None

        if period_start_date is None or period_end_date is None:
            start, end = _default_period(txn.transaction_date)
        else:
            start, end = period_start_date, period_end_date

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


async def count_pending_receipts(organization_id: uuid.UUID) -> int:
    async with AsyncSessionLocal() as db:
        return await pending_rent_receipt_repo.count_pending(db, organization_id)


async def list_pending_receipts(
    *,
    organization_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
) -> list:
    async with AsyncSessionLocal() as db:
        return list(await pending_rent_receipt_repo.list_pending(
            db, organization_id, limit=limit, offset=offset,
        ))


async def send_receipt(
    *,
    transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    period_start: _dt.date,
    period_end: _dt.date,
    payment_method: str | None,
) -> ReceiptSendResult:
    """Path A — generate, upload, email, and record a rent receipt.

    Raises one of the ``Receipt*Error`` domain exceptions on failure.
    The caller (route handler) maps these to HTTP status codes.
    """
    # ── Phase 1: load all data (read-only) ───────────────────────────────────
    async with AsyncSessionLocal() as db:
        txn = await transaction_repo.get_by_id(db, transaction_id, organization_id)
        if txn is None:
            raise LookupError(f"Transaction {transaction_id} not found")
        if txn.applicant_id is None:
            raise ReceiptTransactionNotAttributedError(
                "This transaction hasn't been attributed to a tenant yet."
            )

        applicant = await applicant_repo.get(
            db,
            applicant_id=txn.applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise LookupError(f"Applicant {txn.applicant_id} not found")

        # Resolve tenant email via the linked inquiry
        tenant_email: str | None = None
        if applicant.inquiry_id is not None:
            inq = await inquiry_repo.get_by_id(db, applicant.inquiry_id, organization_id)
            if inq is not None:
                tenant_email = inq.inquirer_email

        if not tenant_email:
            raise ReceiptMissingApplicantEmailError(
                "Tenant has no email address on file. Cannot send the receipt."
            )

        property_address, signed_lease_id = await _resolve_property_address(
            db,
            applicant_id=txn.applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )

        integration = await integration_repo.get_by_org_and_provider(
            db, organization_id, "gmail",
        )
        if integration is None:
            raise ReceiptMissingIntegrationError(
                "Connect Gmail before sending receipts."
            )
        if not integration_service.integration_has_send_scope(integration):
            raise ReceiptMissingSendScopeError(
                "Gmail send permission missing. Reconnect Gmail to enable receipts.",
            )
        if integration.needs_reauth:
            raise ReceiptGmailReauthError(
                "Gmail token expired. Reconnect Gmail to send receipts.",
            )

        host_user = await user_repo.get_by_id(db, user_id)
        if host_user is None or not host_user.email:
            raise LookupError(f"User {user_id} not found or has no email")

        landlord_name = host_user.email.split("@")[0]
        from_address = host_user.email

    # ── Phase 2: claim the receipt number (atomic DB op) ────────────────────
    txn_date: _dt.date  # captured from the read phase above
    async with unit_of_work() as db:
        # Re-fetch transaction inside a fresh session to avoid expired state
        txn2 = await transaction_repo.get_by_id(db, transaction_id, organization_id)
        if txn2 is None:
            raise LookupError(f"Transaction {transaction_id} disappeared")
        txn_date = txn2.transaction_date
        txn_amount: Decimal = txn2.amount
        txn_payment_method = payment_method or txn2.payment_method

        receipt_year = txn_date.year
        receipt_num = await rent_receipt_sequence_repo.next_number(
            db, user_id=user_id, year=receipt_year,
        )
        receipt_number = rent_receipt_sequence_repo.format_receipt_number(
            receipt_year, receipt_num,
        )

    # ── Phase 3: generate PDF (pure, no I/O) ─────────────────────────────────
    receipt_data = ReceiptData(
        receipt_number=receipt_number,
        receipt_date=_dt.date.today(),
        payer_name=applicant.legal_name or "Tenant",
        payer_email=tenant_email,
        landlord_name=landlord_name,
        property_address=property_address,
        period_start=period_start,
        period_end=period_end,
        amount=txn_amount,
        payment_method=txn_payment_method,
    )
    pdf_bytes = generate_receipt_pdf(receipt_data)
    pdf_filename = f"receipt-{receipt_number}.pdf"

    # ── Phase 4: upload to MinIO ──────────────────────────────────────────────
    storage = _storage_module.get_storage()
    storage_key = f"signed-leases/{signed_lease_id or 'unlinked'}/{uuid.uuid4()}/{pdf_filename}"
    storage.upload_file(storage_key, pdf_bytes, "application/pdf")

    # ── Phase 5: persist DB rows + send email ─────────────────────────────────
    now = _dt.datetime.now(_dt.timezone.utc)
    attachment_id: uuid.UUID

    try:
        # Gmail send is outside the DB transaction (send-first, persist-second
        # pattern from inquiry_reply_service).
        subject = (
            f"Rent receipt {receipt_number} — "
            f"{_format_period_short(period_start, period_end)} — "
            f"{property_address}"
        )
        body = (
            f"Hi {applicant.legal_name or 'there'},\n\n"
            f"Please find your rent receipt attached.\n\n"
            f"Receipt #{receipt_number}\n"
            f"Period: {_format_period_long(period_start, period_end)}\n"
            f"Amount: ${txn_amount:,.2f}\n\n"
            f"Thank you,\n{landlord_name}"
        )
        gmail_service.send_message_with_attachment(
            integration,
            from_address=from_address,
            to_address=tenant_email,
            subject=subject,
            body=body,
            attachment_bytes=pdf_bytes,
            attachment_filename=pdf_filename,
            attachment_content_type="application/pdf",
        )
    except GmailReauthRequiredError as exc:
        # Roll back storage upload on failure
        try:
            storage.delete_file(storage_key)
        except Exception:
            logger.warning("Could not clean up orphaned receipt PDF at %s", storage_key)
        async with unit_of_work() as db:
            stale = await integration_repo.get_by_org_and_provider(
                db, organization_id, "gmail",
            )
            if stale is not None:
                await integration_repo.mark_needs_reauth(
                    db, stale, repr(exc)[:200], now,
                )
        raise ReceiptGmailReauthError(str(exc)) from exc
    except (GmailSendScopeError, GmailSendError) as exc:
        try:
            storage.delete_file(storage_key)
        except Exception:
            logger.warning("Could not clean up orphaned receipt PDF at %s", storage_key)
        if isinstance(exc, GmailSendScopeError):
            raise ReceiptMissingSendScopeError(str(exc)) from exc
        raise ReceiptGmailSendError(str(exc)) from exc

    # Gmail succeeded — persist the attachment row and update pending receipt
    async with unit_of_work() as db:
        # We need a lease_id for the attachment — use the resolved one or
        # fall back to the first active lease. If none exists, we can't
        # attach to a lease but still save the receipt somewhere.
        effective_lease_id = signed_lease_id

        if effective_lease_id is None:
            # Try to resolve lease_id again inside this session
            leases = await signed_lease_repo.list_for_tenant(
                db,
                user_id=user_id,
                organization_id=organization_id,
                applicant_id=txn.applicant_id,
                include_deleted=False,
                limit=1,
            )
            effective_lease_id = leases[0].id if leases else None

        if effective_lease_id is None:
            raise LookupError(
                "Cannot save receipt — tenant has no signed lease to attach it to."
            )

        attachment = await signed_lease_attachment_repo.create(
            db,
            lease_id=effective_lease_id,
            storage_key=storage_key,
            filename=pdf_filename,
            content_type="application/pdf",
            size_bytes=len(pdf_bytes),
            kind="rent_receipt",
            uploaded_by_user_id=user_id,
            uploaded_at=now,
        )
        attachment_id = attachment.id

        # Mark pending receipt as sent (if one exists)
        pending = await pending_rent_receipt_repo.get_by_transaction_id(
            db, transaction_id, organization_id,
        )
        if pending is not None:
            await pending_rent_receipt_repo.mark_sent(
                db, pending, attachment_id=attachment_id, sent_at=now,
            )

    logger.info(
        "Sent rent receipt %s for transaction %s (attachment %s)",
        receipt_number, transaction_id, attachment_id,
    )
    return ReceiptSendResult(
        receipt_number=receipt_number,
        attachment_id=attachment_id,
    )


async def dismiss_pending_receipt(
    *,
    transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> None:
    """Path B — dismiss a pending receipt without sending."""
    async with unit_of_work() as db:
        pending = await pending_rent_receipt_repo.get_by_transaction_id(
            db, transaction_id, organization_id,
        )
        if pending is None:
            raise LookupError("No pending receipt found for this transaction")
        if pending.status != "pending":
            raise ValueError(f"Receipt is already {pending.status}")
        await pending_rent_receipt_repo.mark_dismissed(
            db, pending, dismissed_at=_dt.datetime.now(_dt.timezone.utc),
        )


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

        property_address, _ = await _resolve_property_address(
            db,
            applicant_id=txn.applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )

        host_user = await user_repo.get_by_id(db, user_id)
        landlord_name = host_user.email.split("@")[0] if host_user and host_user.email else "Landlord"

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


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _format_period_short(start: _dt.date, end: _dt.date) -> str:
    if start.year == end.year and start.month == end.month:
        return start.strftime("%b %Y")
    return f"{start.strftime('%b %Y')} – {end.strftime('%b %Y')}"


def _format_period_long(start: _dt.date, end: _dt.date) -> str:
    if start.year == end.year and start.month == end.month:
        last = monthrange(start.year, start.month)[1]
        return f"{start.strftime('%B')} {start.day}–{last}, {start.year}"
    return f"{start.strftime('%B %-d, %Y')} – {end.strftime('%B %-d, %Y')}"
