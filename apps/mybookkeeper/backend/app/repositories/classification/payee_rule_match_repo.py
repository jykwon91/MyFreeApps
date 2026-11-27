"""Rows a payee rule could file: the organization's live rows from that payee no person has filed."""
import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tags import TRANSACTION_TYPE_TRANSFER
from app.core.transaction_statuses import NOT_MONEY_STATUSES
from app.models.transactions.transaction import Transaction


async def list_unfiled_from_payee(
    db: AsyncSession,
    organization_id: uuid.UUID,
    normalized_pattern: str,
    *,
    limit: int,
    lock: bool = False,
) -> Sequence[Transaction]:
    """Rows whose normalized vendor contains the rule's pattern, as vendor rules match.

    ``lock`` holds them for an update, so a sync can't refile one at the same time.
    """
    stmt = (
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
            Transaction.filed_by_person_at.is_(None),
            Transaction.transaction_type != TRANSACTION_TYPE_TRANSFER,
            Transaction.status.notin_(NOT_MONEY_STATUSES),
            Transaction.normalized_vendor.contains(normalized_pattern, autoescape=True),
        )
        .order_by(Transaction.transaction_date.desc(), Transaction.id)
        .limit(limit)
    )
    if lock:
        stmt = stmt.with_for_update(of=Transaction)
    result = await db.execute(stmt)
    return result.scalars().all()
