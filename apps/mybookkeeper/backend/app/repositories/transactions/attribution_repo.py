"""Repository for ``rent_attribution_review_queue``.

All queries filter by ``organization_id`` for tenant isolation.
"""
import uuid
from datetime import datetime, timezone
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.applicants.applicant import Applicant
from app.models.transactions.rent_attribution_review_queue import RentAttributionReviewQueue
from app.models.transactions.transaction import Transaction


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    transaction_id: uuid.UUID,
    proposed_applicant_id: uuid.UUID | None,
    confidence: str,
) -> RentAttributionReviewQueue:
    row = RentAttributionReviewQueue(
        user_id=user_id,
        organization_id=organization_id,
        transaction_id=transaction_id,
        proposed_applicant_id=proposed_applicant_id,
        confidence=confidence,
        status="pending",
    )
    db.add(row)
    await db.flush()
    return row


async def get_by_id(
    db: AsyncSession,
    review_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> RentAttributionReviewQueue | None:
    result = await db.execute(
        select(RentAttributionReviewQueue)
        .options(
            selectinload(RentAttributionReviewQueue.transaction),
            selectinload(RentAttributionReviewQueue.proposed_applicant),
        )
        .where(
            RentAttributionReviewQueue.id == review_id,
            RentAttributionReviewQueue.organization_id == organization_id,
            RentAttributionReviewQueue.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_by_transaction_id(
    db: AsyncSession,
    transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> RentAttributionReviewQueue | None:
    result = await db.execute(
        select(RentAttributionReviewQueue)
        .where(
            RentAttributionReviewQueue.transaction_id == transaction_id,
            RentAttributionReviewQueue.organization_id == organization_id,
            RentAttributionReviewQueue.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def list_pending(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    limit: int = 100,
    offset: int = 0,
) -> Sequence[RentAttributionReviewQueue]:
    result = await db.execute(
        select(RentAttributionReviewQueue)
        .options(
            selectinload(RentAttributionReviewQueue.transaction),
            selectinload(RentAttributionReviewQueue.proposed_applicant),
        )
        .where(
            RentAttributionReviewQueue.organization_id == organization_id,
            RentAttributionReviewQueue.status == "pending",
            RentAttributionReviewQueue.deleted_at.is_(None),
        )
        .order_by(RentAttributionReviewQueue.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


async def count_pending(
    db: AsyncSession,
    organization_id: uuid.UUID,
) -> int:
    from sqlalchemy import func
    result = await db.execute(
        select(func.count())
        .select_from(RentAttributionReviewQueue)
        .where(
            RentAttributionReviewQueue.organization_id == organization_id,
            RentAttributionReviewQueue.status == "pending",
            RentAttributionReviewQueue.deleted_at.is_(None),
        )
    )
    return result.scalar_one()


async def resolve(
    db: AsyncSession,
    row: RentAttributionReviewQueue,
    status: str,
) -> RentAttributionReviewQueue:
    row.status = status
    row.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    return row
