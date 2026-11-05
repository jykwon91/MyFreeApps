"""Repository for ``pending_rent_receipts``.

All write operations scope to both ``transaction_id`` and ``organization_id``
(via the linked transaction) to prevent IDOR attacks.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import ColumnElement, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.pending_rent_receipt import OPEN_RECEIPT_STATUSES, PendingRentReceipt


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
    *,
    limit: int = 100,
    offset: int = 0,
) -> list[PendingRentReceipt]:
    """Receipts still waiting on the host: ``pending`` and ``sending``.

    ``sending`` rows stay listed so a send whose outcome was unknown can be
    retried — the retry is what checks Gmail and settles the row.
    """
    result = await db.execute(
        select(PendingRentReceipt)
        .where(
            PendingRentReceipt.organization_id == organization_id,
            PendingRentReceipt.status.in_(OPEN_RECEIPT_STATUSES),
            PendingRentReceipt.deleted_at.is_(None),
        )
        .order_by(PendingRentReceipt.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


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
