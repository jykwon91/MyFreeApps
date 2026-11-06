"""Settle a receipt row an earlier attempt left ``sending``, or release one.

Settling searches the connected mailbox for the attempt's Message-ID. That only
answers "was it sent?" when the attempt went through the connected account:
after a reconnect to another account the search finds nothing and the tenant
would get the receipt twice. So the attempt's address is compared first, and an
attempt from another account is kept and reported instead.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from app.core import storage as _storage_module
from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories.leases import pending_rent_receipt_repo, signed_lease_attachment_repo
from app.services.email import gmail_attachment_send_service
from app.services.email.app_sent_email_service import record_app_sent_email
from app.services.email.constants import APP_SENT_RECEIPT_FILTER_REASON
from app.services.email.exceptions import GmailReauthRequiredError
from app.services.email.gmail_address_match import same_gmail_address
from app.services.email.send_claim_staleness import is_send_claim_stale
from app.services.leases.exceptions import (
    ReceiptAlreadySentError,
    ReceiptGmailReauthError,
    ReceiptSendInProgressError,
    ReceiptSendUnconfirmedError,
    ReceiptSentFromOtherGmailError,
    ReceiptSentNotRecordedError,
)
from app.services.leases.receipt_send_context import ReceiptSendContext

logger = logging.getLogger(__name__)


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


async def discard_attempt(
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
        delete_stored_pdf(storage_key)


def delete_stored_pdf(storage_key: str) -> None:
    try:
        _storage_module.get_storage().delete_file(storage_key)
    except Exception:
        logger.warning("Could not clean up orphaned receipt PDF at %s", storage_key)


async def settle_earlier_attempt(
    ctx: ReceiptSendContext,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    connected_address: str,
) -> None:
    """Resolve a row left ``sending``. Returns only once the claim is released.

    Raises ``ReceiptSentFromOtherGmailError``, keeping the row ``sending``,
    when the attempt went through an account other than ``connected_address``.
    """
    receipt = ctx.receipt
    claimed_at = receipt.send_claimed_at
    send_message_id = receipt.send_message_id
    if claimed_at is None or send_message_id is None:
        raise RuntimeError(f"Receipt {receipt.id} is sending without a claim")
    if not is_send_claim_stale(claimed_at, _now()):
        raise ReceiptSendInProgressError("This receipt is being sent right now.")

    sender = receipt.sender_gmail_address
    if sender is None:
        logger.info("Receipt %s claim has no recorded account; checking the connected one", receipt.id)
    elif not same_gmail_address(sender, connected_address):
        logger.warning(
            "Receipt %s was sent through a Gmail account that's no longer connected; keeping it",
            receipt.id,
        )
        raise ReceiptSentFromOtherGmailError(sender)

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
            from_address=connected_address,
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
    await discard_attempt(
        receipt_id=receipt.id,
        organization_id=organization_id,
        send_message_id=send_message_id,
        attachment_id=receipt.sent_via_attachment_id,
    )
