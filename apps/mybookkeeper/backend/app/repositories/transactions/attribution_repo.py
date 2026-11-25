"""Repository for ``rent_attribution_review_queue``.

All queries filter by ``organization_id`` for tenant isolation.
"""
import uuid
from datetime import datetime, timezone
from collections.abc import Sequence

from platform_shared.repositories.audited_writes import update_rows
from sqlalchemy import delete, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.core.attribution_review_statuses import REVIEW_DISMISSED, REVIEW_PENDING, REVIEW_PERSONAL
from app.core.transaction_statuses import PERSONAL_TRANSFER_STATUS
from app.models.transactions.rent_attribution_review_queue import RentAttributionReviewQueue
from app.models.transactions.transaction import Transaction

# A card is only worth showing while its payment is live and still might be
# rent. Deleting resolves the card, and so does marking a personal transfer,
# but a card is never shown for either even if some other path left it open.
_OPEN_CARD = (
    RentAttributionReviewQueue.status == REVIEW_PENDING,
    RentAttributionReviewQueue.deleted_at.is_(None),
    Transaction.deleted_at.is_(None),
    Transaction.status != PERSONAL_TRANSFER_STATUS,
)


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    transaction_id: uuid.UUID,
    proposed_applicant_id: uuid.UUID | None,
    confidence: str,
    proposed_property_id: uuid.UUID | None = None,
) -> RentAttributionReviewQueue:
    row = RentAttributionReviewQueue(
        user_id=user_id,
        organization_id=organization_id,
        transaction_id=transaction_id,
        proposed_applicant_id=proposed_applicant_id,
        proposed_property_id=proposed_property_id,
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
            selectinload(RentAttributionReviewQueue.proposed_property),
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
            selectinload(RentAttributionReviewQueue.proposed_property),
        )
        .join(Transaction, Transaction.id == RentAttributionReviewQueue.transaction_id)
        .where(RentAttributionReviewQueue.organization_id == organization_id, *_OPEN_CARD)
        .order_by(RentAttributionReviewQueue.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


async def count_pending(
    db: AsyncSession,
    organization_id: uuid.UUID,
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(RentAttributionReviewQueue)
        .join(Transaction, Transaction.id == RentAttributionReviewQueue.transaction_id)
        .where(RentAttributionReviewQueue.organization_id == organization_id, *_OPEN_CARD)
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


async def hard_delete_by_id(
    db: AsyncSession,
    *,
    review_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> uuid.UUID | None:
    """Hard-delete a review row, resolved or not. Returns the deleted row's
    transaction id, or ``None`` when nothing was deleted. Test cleanup only.
    """
    result = await db.execute(
        delete(RentAttributionReviewQueue)
        .where(
            RentAttributionReviewQueue.id == review_id,
            RentAttributionReviewQueue.organization_id == organization_id,
        )
        .returning(RentAttributionReviewQueue.transaction_id)
    )
    return result.scalar_one_or_none()


async def move_pending_review(
    db: AsyncSession,
    *,
    from_transaction_id: uuid.UUID,
    to_transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    """Repoint a removed duplicate's open "who paid this?" review at the row that replaces it.

    Nothing moves when the target already has a review row (one per transaction).
    """
    target = aliased(RentAttributionReviewQueue)
    changed = await update_rows(
        db,
        RentAttributionReviewQueue,
        RentAttributionReviewQueue.transaction_id == from_transaction_id,
        RentAttributionReviewQueue.organization_id == organization_id,
        RentAttributionReviewQueue.status == "pending",
        RentAttributionReviewQueue.deleted_at.is_(None),
        ~exists().where(target.transaction_id == to_transaction_id),
        values={"transaction_id": to_transaction_id},
    )
    return len(changed) == 1


async def resolve_pending_for_transaction(
    db: AsyncSession,
    *,
    transaction_id: uuid.UUID,
    organization_id: uuid.UUID,
    status: str,
) -> None:
    """Close a transaction's open review, if it has one."""
    await update_rows(
        db,
        RentAttributionReviewQueue,
        RentAttributionReviewQueue.transaction_id == transaction_id,
        RentAttributionReviewQueue.organization_id == organization_id,
        RentAttributionReviewQueue.status == "pending",
        RentAttributionReviewQueue.deleted_at.is_(None),
        values={"status": status, "resolved_at": datetime.now(timezone.utc)},
    )


async def list_open_with_payer(
    db: AsyncSession, organization_id: uuid.UUID,
) -> Sequence[RentAttributionReviewQueue]:
    """Open cards whose payment names a payer, with the transaction loaded."""
    result = await db.execute(
        select(RentAttributionReviewQueue)
        .options(selectinload(RentAttributionReviewQueue.transaction))
        .join(Transaction, Transaction.id == RentAttributionReviewQueue.transaction_id)
        .where(
            RentAttributionReviewQueue.organization_id == organization_id,
            Transaction.payer_name.isnot(None),
            *_OPEN_CARD,
        )
        .order_by(RentAttributionReviewQueue.created_at)
    )
    return result.scalars().all()


async def dismiss_pending_for_transactions(
    db: AsyncSession,
    *,
    transaction_ids: list[uuid.UUID],
    organization_id: uuid.UUID,
    dismissed_at: datetime,
) -> int:
    """``pending`` → ``dismissed`` for the cards of the given (just deleted) transactions."""
    if not transaction_ids:
        return 0
    changed = await update_rows(
        db,
        RentAttributionReviewQueue,
        RentAttributionReviewQueue.transaction_id.in_(transaction_ids),
        RentAttributionReviewQueue.organization_id == organization_id,
        RentAttributionReviewQueue.status == REVIEW_PENDING,
        RentAttributionReviewQueue.deleted_at.is_(None),
        values={"status": REVIEW_DISMISSED, "resolved_at": dismissed_at},
    )
    return len(changed)


async def reopen_personal_for_transaction(
    db: AsyncSession, *, transaction_id: uuid.UUID, organization_id: uuid.UUID,
) -> bool:
    """``personal`` → ``pending`` for the card of a transaction no longer a personal transfer."""
    changed = await update_rows(
        db,
        RentAttributionReviewQueue,
        RentAttributionReviewQueue.transaction_id == transaction_id,
        RentAttributionReviewQueue.organization_id == organization_id,
        RentAttributionReviewQueue.status == REVIEW_PERSONAL,
        RentAttributionReviewQueue.deleted_at.is_(None),
        values={"status": REVIEW_PENDING, "resolved_at": None},
    )
    return bool(changed)
