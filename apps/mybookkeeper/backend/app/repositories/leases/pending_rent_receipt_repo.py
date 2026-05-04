"""Repository for ``pending_rent_receipts``.

All write operations scope to both ``transaction_id`` and ``organization_id``
(via the linked transaction) to prevent IDOR attacks.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.pending_rent_receipt import PendingRentReceipt


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


async def list_pending(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    limit: int = 100,
    offset: int = 0,
) -> list[PendingRentReceipt]:
    result = await db.execute(
        select(PendingRentReceipt)
        .where(
            PendingRentReceipt.organization_id == organization_id,
            PendingRentReceipt.status == "pending",
            PendingRentReceipt.deleted_at.is_(None),
        )
        .order_by(PendingRentReceipt.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def count_pending(
    db: AsyncSession,
    organization_id: uuid.UUID,
) -> int:
    from sqlalchemy import func, select as sa_select
    result = await db.execute(
        sa_select(func.count()).select_from(PendingRentReceipt).where(
            PendingRentReceipt.organization_id == organization_id,
            PendingRentReceipt.status == "pending",
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


async def mark_sent(
    db: AsyncSession,
    receipt: PendingRentReceipt,
    *,
    attachment_id: uuid.UUID,
    sent_at: _dt.datetime,
) -> None:
    await db.execute(
        update(PendingRentReceipt)
        .where(
            PendingRentReceipt.id == receipt.id,
            PendingRentReceipt.organization_id == receipt.organization_id,
        )
        .values(
            status="sent",
            sent_at=sent_at,
            sent_via_attachment_id=attachment_id,
            updated_at=sent_at,
        )
    )


async def mark_dismissed(
    db: AsyncSession,
    receipt: PendingRentReceipt,
    dismissed_at: _dt.datetime,
) -> None:
    await db.execute(
        update(PendingRentReceipt)
        .where(
            PendingRentReceipt.id == receipt.id,
            PendingRentReceipt.organization_id == receipt.organization_id,
        )
        .values(
            status="dismissed",
            updated_at=dismissed_at,
        )
    )
