"""Transaction lookups the Plaid sync needs: by Plaid id, a row a bank import
already brought in, and the other leg of a transfer."""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Collection
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plaid_constants import PLAID_EXTERNAL_SOURCE
from app.core.tags import TRANSACTION_TYPE_INCOME, TRANSACTION_TYPE_TRANSFER, UNCATEGORIZED_CATEGORY
from app.models.transactions.transaction import Transaction


async def find_by_plaid_id(
    db: AsyncSession, *, organization_id: uuid.UUID, transaction_id: str,
) -> Transaction | None:
    """The row for a Plaid transaction id, deleted or not.

    Deleted rows count: the unique key on (org, source, id) covers them, and a
    row the person deleted must stay deleted rather than come back on the next
    sync.
    """
    result = await db.execute(select(Transaction).where(
        Transaction.organization_id == organization_id,
        Transaction.external_source == PLAID_EXTERNAL_SOURCE,
        Transaction.external_id == transaction_id,
    ))
    return result.scalar_one_or_none()


async def lock_live_by_plaid_ids(
    db: AsyncSession, *, organization_id: uuid.UUID, transaction_ids: Collection[str],
) -> list[Transaction]:
    if not transaction_ids:
        return []
    result = await db.execute(
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.external_source == PLAID_EXTERNAL_SOURCE,
            Transaction.external_id.in_(list(transaction_ids)),
            Transaction.deleted_at.is_(None),
        )
        .with_for_update(),
    )
    return list(result.scalars().all())


async def find_existing_bank_row(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    account_id: uuid.UUID,
    transaction_date: _dt.date,
    amount: Decimal,
    transaction_type: str,
    connected_at: _dt.datetime,
    exclude_ids: Collection[uuid.UUID],
) -> Transaction | None:
    """A live row on the same account, day, amount and direction that did not
    come from this connection — a bank CSV import, a manual entry, or a sync
    from an earlier connection to the same bank (rows synced before this
    connection existed). Rows this connection synced are never matched: two
    same-amount purchases on one day are two purchases.
    """
    stmt = (
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.account_id == account_id,
            Transaction.transaction_date == transaction_date,
            Transaction.amount == amount,
            Transaction.transaction_type == transaction_type,
            Transaction.deleted_at.is_(None),
            or_(
                Transaction.external_source.is_(None),
                Transaction.external_source != PLAID_EXTERNAL_SOURCE,
                Transaction.created_at < connected_at,
            ),
        )
        .order_by(Transaction.created_at)
    )
    if exclude_ids:
        stmt = stmt.where(Transaction.id.not_in(list(exclude_ids)))
    result = await db.execute(stmt.limit(1))
    return result.scalar_one_or_none()


async def list_transfer_counterparts(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    account_ids: Collection[uuid.UUID],
    amount: Decimal,
    transaction_type: str,
    date_from: _dt.date,
    date_to: _dt.date,
    external_categories: Collection[str],
) -> list[Transaction]:
    """Candidates for the other leg of a transfer: synced rows on one of
    ``account_ids`` moving the same amount the other way, within the date
    window, that Plaid also called a transfer."""
    if not account_ids:
        return []
    result = await db.execute(
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.account_id.in_(list(account_ids)),
            Transaction.amount == amount,
            Transaction.transaction_type == transaction_type,
            Transaction.transaction_type != TRANSACTION_TYPE_TRANSFER,
            Transaction.transaction_date.between(date_from, date_to),
            Transaction.external_source == PLAID_EXTERNAL_SOURCE,
            Transaction.external_category.in_(list(external_categories)),
            Transaction.deleted_at.is_(None),
        )
        .order_by(Transaction.transaction_date, Transaction.created_at),
    )
    return list(result.scalars().all())


async def list_untriaged_income(
    db: AsyncSession, *, organization_id: uuid.UUID,
) -> list[Transaction]:
    """Synced income no one has filed yet and attribution hasn't read: still
    ``uncategorized``, no tenant, no payer name. Attribution stores the payer
    name it read, so a row it has read is not listed again."""
    result = await db.execute(
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.external_source == PLAID_EXTERNAL_SOURCE,
            Transaction.transaction_type == TRANSACTION_TYPE_INCOME,
            Transaction.category == UNCATEGORIZED_CATEGORY,
            Transaction.applicant_id.is_(None),
            Transaction.payer_name.is_(None),
            Transaction.deleted_at.is_(None),
        )
        .order_by(Transaction.transaction_date, Transaction.created_at),
    )
    return list(result.scalars().all())
