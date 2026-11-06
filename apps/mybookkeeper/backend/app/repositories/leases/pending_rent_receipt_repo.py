"""Repository for ``pending_rent_receipts``.

All write operations scope to both ``transaction_id`` and ``organization_id``
(via the linked transaction) to prevent IDOR attacks.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import ColumnElement, and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.inquiries.inquiry import Inquiry
from app.models.leases.pending_rent_receipt import OPEN_RECEIPT_STATUSES, PendingRentReceipt
from app.models.leases.signed_lease import SignedLease
from app.models.transactions.transaction import Transaction
from app.schemas.leases.pending_receipt_list_row import PendingReceiptListRow


async def get_by_transaction_id(
    db: AsyncSession,
    transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> PendingRentReceipt | None:
    """Return the pending receipt row for a transaction, scoped to the org."""
    result = await db.execute(
        select(PendingRentReceipt).where(
            PendingRentReceipt.transaction_id == transaction_id,
            PendingRentReceipt.organization_id == organization_id,
            PendingRentReceipt.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_by_id(
    db: AsyncSession,
    receipt_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> PendingRentReceipt | None:
    result = await db.execute(
        select(PendingRentReceipt).where(
            PendingRentReceipt.id == receipt_id,
            PendingRentReceipt.organization_id == organization_id,
            PendingRentReceipt.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def list_open(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    limit: int = 100,
    offset: int = 0,
) -> list[PendingReceiptListRow]:
    """Receipts still waiting on the host: ``pending`` and ``sending``.

    ``sending`` rows stay listed so a send whose outcome was unknown can be
    retried — the retry is what checks Gmail and settles the row.

    The tenant is read org-wide with its owner, so the service can tell a
    teammate's tenant from a deleted one. The lease is read as the requesting
    user, as ``send_receipt`` reads it.
    """
    has_lease = (
        select(SignedLease.id)
        .where(
            SignedLease.applicant_id == Transaction.applicant_id,
            SignedLease.user_id == user_id,
            SignedLease.organization_id == organization_id,
            SignedLease.deleted_at.is_(None),
        )
        .exists()
    )
    result = await db.execute(
        select(
            PendingRentReceipt.id.label("id"),
            PendingRentReceipt.transaction_id.label("transaction_id"),
            PendingRentReceipt.applicant_id.label("applicant_id"),
            PendingRentReceipt.signed_lease_id.label("signed_lease_id"),
            PendingRentReceipt.period_start_date.label("period_start_date"),
            PendingRentReceipt.period_end_date.label("period_end_date"),
            PendingRentReceipt.status.label("status"),
            PendingRentReceipt.sent_at.label("sent_at"),
            PendingRentReceipt.sent_via_attachment_id.label("sent_via_attachment_id"),
            PendingRentReceipt.created_at.label("created_at"),
            Transaction.amount.label("amount"),
            Transaction.transaction_date.label("transaction_date"),
            Transaction.payer_name.label("payer_name"),
            Transaction.payment_method.label("payment_method"),
            Transaction.vendor.label("vendor"),
            Transaction.applicant_id.is_not(None).label("attributed"),
            Applicant.user_id.label("tenant_owner_id"),
            Applicant.legal_name.label("tenant_name"),
            Applicant.contact_email.label("contact_email"),
            Inquiry.inquirer_email.label("inquirer_email"),
            has_lease.label("has_lease"),
        )
        .join(
            Transaction,
            and_(
                Transaction.id == PendingRentReceipt.transaction_id,
                Transaction.organization_id == organization_id,
            ),
        )
        .outerjoin(
            Applicant,
            and_(
                Applicant.id == Transaction.applicant_id,
                Applicant.organization_id == organization_id,
                Applicant.deleted_at.is_(None),
            ),
        )
        .outerjoin(
            Inquiry,
            and_(
                Inquiry.id == Applicant.inquiry_id,
                Inquiry.organization_id == organization_id,
                Inquiry.deleted_at.is_(None),
            ),
        )
        .where(
            PendingRentReceipt.organization_id == organization_id,
            PendingRentReceipt.status.in_(OPEN_RECEIPT_STATUSES),
            PendingRentReceipt.deleted_at.is_(None),
        )
        .order_by(PendingRentReceipt.created_at.desc(), PendingRentReceipt.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return [PendingReceiptListRow.model_validate(dict(r._mapping)) for r in result.all()]


async def count_open(
    db: AsyncSession,
    organization_id: uuid.UUID,
) -> int:
    """Rows ``list_open`` returns: still to send, or a send still to confirm."""
    result = await db.execute(
        select(func.count()).select_from(PendingRentReceipt).where(
            PendingRentReceipt.organization_id == organization_id,
            PendingRentReceipt.status.in_(OPEN_RECEIPT_STATUSES),
            PendingRentReceipt.deleted_at.is_(None),
        )
    )
    return result.scalar_one()


async def create_idempotent(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    transaction_id: uuid.UUID,
    applicant_id: uuid.UUID,
    signed_lease_id: uuid.UUID | None,
    period_start_date: _dt.date,
    period_end_date: _dt.date,
) -> PendingRentReceipt:
    """Create a pending receipt, or return the existing one if already present.

    Idempotent on ``transaction_id`` — the UNIQUE constraint means there can
    only ever be one row per transaction.
    """
    existing = await get_by_transaction_id(db, transaction_id, organization_id)
    if existing is not None:
        return existing

    row = PendingRentReceipt(
        user_id=user_id,
        organization_id=organization_id,
        transaction_id=transaction_id,
        applicant_id=applicant_id,
        signed_lease_id=signed_lease_id,
        period_start_date=period_start_date,
        period_end_date=period_end_date,
        status="pending",
    )
    db.add(row)
    await db.flush()
    return row


async def claim_for_send(
    db: AsyncSession,
    *,
    transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
    send_message_id: str,
    sender_gmail_address: str,
    claimed_at: _dt.datetime,
) -> PendingRentReceipt | None:
    """Move a ``pending`` row to ``sending``; return it, or None if not pending.

    One conditional UPDATE, so of two concurrent claims exactly one matches.
    """
    result = await db.execute(
        update(PendingRentReceipt)
        .where(
            PendingRentReceipt.transaction_id == transaction_id,
            PendingRentReceipt.organization_id == organization_id,
            PendingRentReceipt.status == "pending",
            PendingRentReceipt.deleted_at.is_(None),
        )
        .values(
            status="sending",
            send_message_id=send_message_id,
            send_claimed_at=claimed_at,
            sender_gmail_address=sender_gmail_address,
            sent_via_attachment_id=None,
            updated_at=claimed_at,
        )
        .returning(PendingRentReceipt)
        .execution_options(synchronize_session=False)
    )
    return result.scalar_one_or_none()


def _held_by(
    receipt_id: uuid.UUID, organization_id: uuid.UUID, send_message_id: str,
) -> tuple[ColumnElement[bool], ...]:
    return (
        PendingRentReceipt.id == receipt_id,
        PendingRentReceipt.organization_id == organization_id,
        PendingRentReceipt.status == "sending",
        PendingRentReceipt.send_message_id == send_message_id,
    )


async def set_attempt_attachment(
    db: AsyncSession,
    *,
    receipt_id: uuid.UUID,
    organization_id: uuid.UUID,
    send_message_id: str,
    attachment_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        update(PendingRentReceipt)
        .where(*_held_by(receipt_id, organization_id, send_message_id))
        .values(sent_via_attachment_id=attachment_id)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


async def mark_sent_if_claimed(
    db: AsyncSession,
    *,
    receipt_id: uuid.UUID,
    organization_id: uuid.UUID,
    send_message_id: str,
    sent_at: _dt.datetime,
) -> bool:
    """``sending`` → ``sent``, only while this attempt still holds the claim."""
    result = await db.execute(
        update(PendingRentReceipt)
        .where(*_held_by(receipt_id, organization_id, send_message_id))
        .values(status="sent", sent_at=sent_at, updated_at=sent_at)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


async def release_claim(
    db: AsyncSession,
    *,
    receipt_id: uuid.UUID,
    organization_id: uuid.UUID,
    send_message_id: str,
    released_at: _dt.datetime,
) -> bool:
    """``sending`` → ``pending``, only while this attempt still holds the claim.

    Keyed on the attempt's Message-ID so a late release can never undo a
    newer attempt.
    """
    result = await db.execute(
        update(PendingRentReceipt)
        .where(*_held_by(receipt_id, organization_id, send_message_id))
        .values(
            status="pending",
            send_message_id=None,
            send_claimed_at=None,
            sender_gmail_address=None,
            sent_via_attachment_id=None,
            updated_at=released_at,
        )
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


async def mark_dismissed_if_pending(
    db: AsyncSession,
    *,
    transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
    dismissed_at: _dt.datetime,
) -> bool:
    """``pending`` → ``dismissed``; False if the row isn't pending (e.g. mid-send)."""
    result = await db.execute(
        update(PendingRentReceipt)
        .where(
            PendingRentReceipt.transaction_id == transaction_id,
            PendingRentReceipt.organization_id == organization_id,
            PendingRentReceipt.status == "pending",
            PendingRentReceipt.deleted_at.is_(None),
        )
        .values(status="dismissed", updated_at=dismissed_at)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


async def mark_dismissed_if_claimed(
    db: AsyncSession,
    *,
    receipt_id: uuid.UUID,
    organization_id: uuid.UUID,
    send_message_id: str,
    dismissed_at: _dt.datetime,
) -> bool:
    """``sending`` → ``dismissed``, only while the claim is still the one checked.

    For a claim that can't be settled because Gmail now holds another account.
    The claim's Message-ID, address and PDF stay as the record of the attempt.
    """
    result = await db.execute(
        update(PendingRentReceipt)
        .where(*_held_by(receipt_id, organization_id, send_message_id))
        .values(status="dismissed", updated_at=dismissed_at)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1
