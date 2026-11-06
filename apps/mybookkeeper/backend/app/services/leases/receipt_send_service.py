"""Email a rent receipt to the tenant exactly once.

Flow for ``send_receipt``:
  1. Load and check everything, writing nothing: the pending receipt, the
     transaction, tenant, tenant email, the lease the receipt is filed under,
     Gmail, and the host. Anything missing fails here, before any email.
  2. If an earlier attempt left the row ``sending``, settle it first (below).
  3. Claim the row (``pending`` → ``sending``) and take the receipt number in
     one transaction. The claim is a conditional UPDATE, so of two concurrent
     sends exactly one proceeds; the other gets ``ReceiptSendInProgressError``.
  4. Build the PDF, upload it and insert the attachment row. A failure here
     releases the claim — nothing was emailed.
  5. Send through Gmail with a Message-ID we generated and stored at claim.
     A definite rejection releases the claim and removes the attachment. An
     unknown outcome (5xx, timeout) leaves the row ``sending``.
  6. Record the Gmail message id as app-sent, then mark the row ``sent``.
     If that fails, the email went out: the row stays ``sending``.

Settling a ``sending`` row (step 2): while the claim is younger than
``GMAIL_SEND_CLAIM_STALE_AFTER`` the attempt that holds it may still be
running, so the new request is refused. After that, Gmail is searched for the
stored Message-ID. Found → the row is marked sent. Not found → the claim is
released and this request sends. A failed search changes nothing.

A skipped receipt number (claim released after numbering) is accepted rather
than risk two receipts sharing a number.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from decimal import Decimal
from email.utils import make_msgid

from app.core import storage as _storage_module
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.leases.pending_rent_receipt import PendingRentReceipt
from app.repositories import integration_repo
from app.repositories.applicants import applicant_repo
from app.repositories.inquiries import inquiry_repo
from app.repositories.leases import (
    pending_rent_receipt_repo,
    rent_receipt_sequence_repo,
    signed_lease_attachment_repo,
)
from app.repositories.transactions import transaction_repo
from app.repositories.user import user_repo
from app.services.email import gmail_attachment_send_service
from app.services.email.app_sent_email_service import record_app_sent_email
from app.services.email.constants import APP_SENT_RECEIPT_FILTER_REASON, GMAIL_MESSAGE_ID_DOMAIN
from app.services.email.exceptions import (
    GmailReauthRequiredError,
    GmailSendError,
    GmailSendOutcomeUnknownError,
    GmailSendScopeError,
)
from app.services.email.send_claim_staleness import is_send_claim_stale
from app.services.leases.exceptions import (
    ReceiptAlreadySentError,
    ReceiptDismissedError,
    ReceiptGmailReauthError,
    ReceiptGmailSendError,
    ReceiptMissingSendScopeError,
    ReceiptSendInProgressError,
    ReceiptSendUnconfirmedError,
    ReceiptSentNotRecordedError,
)
from app.services.leases.receipt_address_resolver import resolve_property_address
from app.services.leases.receipt_formatting import (
    format_period_long,
    format_period_short,
    resolve_landlord_name,
)
from app.services.leases.receipt_pdf_service import ReceiptData, generate_receipt_pdf
from app.services.leases.receipt_send_context import ReceiptSendContext
from app.services.leases.receipt_send_readiness import (
    blocker_error,
    gmail_state_error,
    receipt_gmail_state,
    receipt_send_blocker,
    resolve_tenant_email,
)
from app.services.leases.receipt_send_result import ReceiptSendResult

logger = logging.getLogger(__name__)


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def _refusal_for(receipt: PendingRentReceipt | None) -> Exception:
    if receipt is None:
        return LookupError("No pending receipt for this transaction.")
    if receipt.status == "sent":
        return ReceiptAlreadySentError("This receipt was already sent.")
    if receipt.status == "dismissed":
        return ReceiptDismissedError("This receipt was dismissed.")
    return ReceiptSendInProgressError("This receipt is being sent right now.")


async def _load_context(
    *,
    transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ReceiptSendContext:
    async with AsyncSessionLocal() as db:
        receipt = await pending_rent_receipt_repo.get_by_transaction_id(
            db, transaction_id, organization_id,
        )
        if receipt is None or receipt.status in ("sent", "dismissed"):
            raise _refusal_for(receipt)

        txn = await transaction_repo.get_by_id(db, transaction_id, organization_id)
        if txn is None:
            raise LookupError(f"Transaction {transaction_id} not found")

        applicant = None
        tenant_owner_id: uuid.UUID | None = None
        tenant_email: str | None = None
        property_address = ""
        lease_id: uuid.UUID | None = None
        if txn.applicant_id is not None:
            applicant = await applicant_repo.get(
                db,
                applicant_id=txn.applicant_id,
                organization_id=organization_id,
                user_id=user_id,
            )
            tenant_owner_id = (
                user_id if applicant is not None
                else await applicant_repo.get_live_owner_id(
                    db, applicant_id=txn.applicant_id, organization_id=organization_id,
                )
            )
        if applicant is not None:
            inquirer_email: str | None = None
            if applicant.inquiry_id is not None:
                inq = await inquiry_repo.get_by_id(db, applicant.inquiry_id, organization_id)
                if inq is not None:
                    inquirer_email = inq.inquirer_email
            tenant_email = resolve_tenant_email(applicant.contact_email, inquirer_email)
            property_address, lease_id = await resolve_property_address(
                db,
                applicant_id=applicant.id,
                organization_id=organization_id,
                user_id=user_id,
            )
        blocker = receipt_send_blocker(
            attributed=txn.applicant_id is not None,
            tenant_owner_id=tenant_owner_id,
            requester_id=user_id,
            tenant_email=tenant_email,
            has_lease=lease_id is not None,
        )
        if blocker is not None:
            raise blocker_error(blocker)
        assert applicant is not None and tenant_email and lease_id is not None

        integration = await integration_repo.get_by_org_and_provider(
            db, organization_id, "gmail",
        )
        gmail_state = receipt_gmail_state(integration)
        if gmail_state != "ready":
            raise gmail_state_error(gmail_state)
        assert integration is not None

        host_user = await user_repo.get_by_id(db, user_id)
        if not host_user or not host_user.email:
            raise LookupError(f"User {user_id} not found or has no email")

        return ReceiptSendContext(
            receipt=receipt,
            tenant_name=applicant.legal_name,
            tenant_email=tenant_email,
            property_address=property_address,
            lease_id=lease_id,
            integration=integration,
            landlord_name=resolve_landlord_name(host_user),
            from_address=host_user.email,
        )


async def _discard_attempt(
    *,
    receipt_id: uuid.UUID,
    organization_id: uuid.UUID,
    send_message_id: str,
    attachment_id: uuid.UUID | None,
) -> None:
    """Release a claim whose email definitely did not go out, and remove its PDF."""
    storage_key: str | None = None
    async with unit_of_work() as db:
        released = await pending_rent_receipt_repo.release_claim(
            db,
            receipt_id=receipt_id,
            organization_id=organization_id,
            send_message_id=send_message_id,
            released_at=_now(),
        )
        if released and attachment_id is not None:
            attachment = await signed_lease_attachment_repo.get_by_id(db, attachment_id)
            if attachment is not None:
                storage_key = attachment.storage_key
                await signed_lease_attachment_repo.delete_by_id_scoped_to_lease(
                    db, attachment.id, attachment.lease_id,
                )
    if storage_key is not None:
        _delete_stored_pdf(storage_key)


def _delete_stored_pdf(storage_key: str) -> None:
    try:
        _storage_module.get_storage().delete_file(storage_key)
    except Exception:
        logger.warning("Could not clean up orphaned receipt PDF at %s", storage_key)


async def _settle_earlier_attempt(
    ctx: ReceiptSendContext, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> None:
    """Resolve a row left ``sending``. Returns only once the claim is released."""
    receipt = ctx.receipt
    claimed_at = receipt.send_claimed_at
    send_message_id = receipt.send_message_id
    if claimed_at is None or send_message_id is None:
        raise RuntimeError(f"Receipt {receipt.id} is sending without a claim")
    if not is_send_claim_stale(claimed_at, _now()):
        raise ReceiptSendInProgressError("This receipt is being sent right now.")

    attachment_filename: str | None = None
    if receipt.sent_via_attachment_id is not None:
        async with AsyncSessionLocal() as db:
            attachment = await signed_lease_attachment_repo.get_by_id(
                db, receipt.sent_via_attachment_id,
            )
            attachment_filename = attachment.filename if attachment is not None else None

    try:
        gmail_id = await gmail_attachment_send_service.find_sent_message_id(
            ctx.integration,
            send_message_id,
            attachment_filename=attachment_filename,
            to_address=ctx.tenant_email,
        )
    except GmailReauthRequiredError as exc:
        raise ReceiptGmailReauthError(str(exc)) from exc
    except Exception as exc:
        logger.error(
            "Could not check Gmail for receipt %s (Message-ID %s)",
            receipt.id, send_message_id, exc_info=True,
        )
        raise ReceiptSendUnconfirmedError("Couldn't check Gmail for this receipt.") from exc

    if gmail_id is not None:
        await record_app_sent_email(
            organization_id=organization_id,
            user_id=user_id,
            message_id=gmail_id,
            from_address=ctx.from_address,
            subject=None,
            reason=APP_SENT_RECEIPT_FILTER_REASON,
        )
        try:
            async with unit_of_work() as db:
                await pending_rent_receipt_repo.mark_sent_if_claimed(
                    db,
                    receipt_id=receipt.id,
                    organization_id=organization_id,
                    send_message_id=send_message_id,
                    sent_at=_now(),
                )
        except Exception as exc:
            logger.error("Receipt %s is in Gmail but couldn't be marked sent", receipt.id, exc_info=True)
            raise ReceiptSentNotRecordedError("The receipt was emailed but not saved as sent.") from exc
        logger.info("Receipt %s was already in Gmail's Sent; marked sent", receipt.id)
        raise ReceiptAlreadySentError("This receipt was already sent.")

    logger.warning(
        "Receipt %s claim is stale and Gmail has no such message; releasing it", receipt.id,
    )
    await _discard_attempt(
        receipt_id=receipt.id,
        organization_id=organization_id,
        send_message_id=send_message_id,
        attachment_id=receipt.sent_via_attachment_id,
    )


async def send_receipt(
    *,
    transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    period_start: _dt.date,
    period_end: _dt.date,
    payment_method: str | None,
) -> ReceiptSendResult:
    """Generate, file and email a rent receipt. Never emails the tenant twice.

    Raises the ``app.services.leases.exceptions`` errors; the route maps them
    to HTTP status codes.
    """
    ctx = await _load_context(
        transaction_id=transaction_id,
        organization_id=organization_id,
        user_id=user_id,
    )
    if ctx.receipt.status == "sending":
        await _settle_earlier_attempt(ctx, organization_id, user_id)

    # ── Claim ────────────────────────────────────────────────────────────────
    send_message_id = make_msgid(domain=GMAIL_MESSAGE_ID_DOMAIN)
    async with unit_of_work() as db:
        claimed = await pending_rent_receipt_repo.claim_for_send(
            db,
            transaction_id=transaction_id,
            organization_id=organization_id,
            send_message_id=send_message_id,
            claimed_at=_now(),
        )
        if claimed is None:
            raise _refusal_for(
                await pending_rent_receipt_repo.get_by_transaction_id(
                    db, transaction_id, organization_id,
                )
            )
        receipt_id = claimed.id
        txn = await transaction_repo.get_by_id(db, transaction_id, organization_id)
        if txn is None:
            raise LookupError(f"Transaction {transaction_id} disappeared")
        txn_amount: Decimal = txn.amount
        txn_payment_method = payment_method or txn.payment_method
        receipt_year = txn.transaction_date.year
        receipt_num = await rent_receipt_sequence_repo.next_number(
            db, user_id=user_id, year=receipt_year,
        )
    receipt_number = rent_receipt_sequence_repo.format_receipt_number(receipt_year, receipt_num)

    # ── File the PDF before sending ──────────────────────────────────────────
    pdf_filename = f"receipt-{receipt_number}.pdf"
    storage_key = f"signed-leases/{ctx.lease_id}/{uuid.uuid4()}/{pdf_filename}"
    uploaded = False
    try:
        pdf_bytes = generate_receipt_pdf(ReceiptData(
            receipt_number=receipt_number,
            receipt_date=_dt.date.today(),
            payer_name=ctx.tenant_name or "Tenant",
            payer_email=ctx.tenant_email,
            landlord_name=ctx.landlord_name,
            property_address=ctx.property_address,
            period_start=period_start,
            period_end=period_end,
            amount=txn_amount,
            payment_method=txn_payment_method,
        ))
        _storage_module.get_storage().upload_file(storage_key, pdf_bytes, "application/pdf")
        uploaded = True
        async with unit_of_work() as db:
            attachment = await signed_lease_attachment_repo.create(
                db,
                lease_id=ctx.lease_id,
                storage_key=storage_key,
                filename=pdf_filename,
                content_type="application/pdf",
                size_bytes=len(pdf_bytes),
                kind="rent_receipt",
                uploaded_by_user_id=user_id,
                uploaded_at=_now(),
            )
            attachment_id = attachment.id
            if not await pending_rent_receipt_repo.set_attempt_attachment(
                db,
                receipt_id=receipt_id,
                organization_id=organization_id,
                send_message_id=send_message_id,
                attachment_id=attachment_id,
            ):
                raise RuntimeError(f"Lost the send claim on receipt {receipt_id}")
    except BaseException:  # cancellation too: never leave a claimed row and PDF behind
        try:
            await _discard_attempt(
                receipt_id=receipt_id,
                organization_id=organization_id,
                send_message_id=send_message_id,
                attachment_id=None,
            )
        finally:
            if uploaded:
                _delete_stored_pdf(storage_key)
        raise

    # ── Send ─────────────────────────────────────────────────────────────────
    subject = (
        f"Rent receipt {receipt_number} — "
        f"{format_period_short(period_start, period_end)} — "
        f"{ctx.property_address}"
    )
    body = (
        f"Hi {ctx.tenant_name or 'there'},\n\n"
        f"Please find your rent receipt attached.\n\n"
        f"Receipt #{receipt_number}\n"
        f"Period: {format_period_long(period_start, period_end)}\n"
        f"Amount: ${txn_amount:,.2f}\n\n"
        f"Thank you,\n{ctx.landlord_name}"
    )
    try:
        gmail_id = await gmail_attachment_send_service.send_message_with_attachment(
            ctx.integration,
            from_address=ctx.from_address,
            to_address=ctx.tenant_email,
            subject=subject,
            body=body,
            attachment_bytes=pdf_bytes,
            attachment_filename=pdf_filename,
            attachment_content_type="application/pdf",
            message_id_header=send_message_id,
        )
    except GmailSendOutcomeUnknownError as exc:
        logger.error(
            "Receipt %s: Gmail outcome unknown; left sending (Message-ID %s)",
            receipt_id, send_message_id,
        )
        raise ReceiptSendUnconfirmedError(str(exc)) from exc
    except (GmailReauthRequiredError, GmailSendScopeError, GmailSendError) as exc:
        await _discard_attempt(
            receipt_id=receipt_id,
            organization_id=organization_id,
            send_message_id=send_message_id,
            attachment_id=attachment_id,
        )
        if isinstance(exc, GmailReauthRequiredError):
            raise ReceiptGmailReauthError(str(exc)) from exc
        if isinstance(exc, GmailSendScopeError):
            raise ReceiptMissingSendScopeError(str(exc)) from exc
        raise ReceiptGmailSendError(str(exc)) from exc

    # ── Record ───────────────────────────────────────────────────────────────
    # The app-sent record comes first and in its own transaction so the Gmail
    # sync never re-ingests this receipt as income, even if marking it sent
    # fails below.
    await record_app_sent_email(
        organization_id=organization_id,
        user_id=user_id,
        message_id=gmail_id,
        from_address=ctx.from_address,
        subject=subject,
        reason=APP_SENT_RECEIPT_FILTER_REASON,
    )
    try:
        async with unit_of_work() as db:
            marked = await pending_rent_receipt_repo.mark_sent_if_claimed(
                db,
                receipt_id=receipt_id,
                organization_id=organization_id,
                send_message_id=send_message_id,
                sent_at=_now(),
            )
        if not marked:
            raise RuntimeError(f"Lost the send claim on receipt {receipt_id} after sending")
    except Exception as exc:
        logger.error(
            "Receipt %s was emailed (Gmail id %s) but couldn't be marked sent",
            receipt_id, gmail_id, exc_info=True,
        )
        raise ReceiptSentNotRecordedError("The receipt was emailed but not saved as sent.") from exc

    logger.info(
        "Sent rent receipt %s for transaction %s (attachment %s)",
        receipt_number, transaction_id, attachment_id,
    )
    return ReceiptSendResult(receipt_number=receipt_number, attachment_id=attachment_id)
