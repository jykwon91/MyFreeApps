"""Rows already on file from an email or a document that a synced bank row may
be a copy of: live, same org, amount and direction, on no account or the
synced row's account, and linked to no source id (so never another synced
row or a bank-CSV row). ``plaid_copy_matcher`` decides which are the same money.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Collection
from decimal import Decimal

from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.orm.util import AliasedClass

from app.core.plaid_constants import PLAID_EXTERNAL_SOURCE
from app.core.tags import TRANSACTION_TYPE_TRANSFER
from app.core.transaction_statuses import DUPLICATE_STATUS
from app.models.transactions.transaction import Transaction


def _unlinked_live(row: type[Transaction] | AliasedClass[Transaction]) -> ColumnElement[bool]:
    return and_(
        row.external_id.is_(None),
        row.deleted_at.is_(None),
        row.status != DUPLICATE_STATUS,
        row.transaction_type != TRANSACTION_TYPE_TRANSFER,
    )


async def list_unlinked_copies(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    account_id: uuid.UUID,
    amount: Decimal,
    transaction_type: str,
    date_from: _dt.date,
    date_to: _dt.date,
    exclude_ids: Collection[uuid.UUID],
) -> list[Transaction]:
    stmt = select(Transaction).where(
        Transaction.organization_id == organization_id,
        Transaction.amount == amount,
        Transaction.transaction_type == transaction_type,
        Transaction.transaction_date.between(date_from, date_to),
        or_(Transaction.account_id.is_(None), Transaction.account_id == account_id),
        _unlinked_live(Transaction),
    ).order_by(Transaction.transaction_date, Transaction.created_at)
    if exclude_ids:
        stmt = stmt.where(Transaction.id.not_in(list(exclude_ids)))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_synced_copy_pairs(
    db: AsyncSession, *, organization_id: uuid.UUID,
) -> list[tuple[Transaction, Transaction]]:
    """Every ``(synced row, row on file)`` pair with the same amount and
    direction, any date apart — the matcher applies the date window."""
    synced = aliased(Transaction)
    on_file = aliased(Transaction)
    result = await db.execute(
        select(synced, on_file)
        .join(on_file, and_(
            on_file.organization_id == synced.organization_id,
            on_file.amount == synced.amount,
            on_file.transaction_type == synced.transaction_type,
            or_(on_file.account_id.is_(None), on_file.account_id == synced.account_id),
            _unlinked_live(on_file),
        ))
        .where(
            synced.organization_id == organization_id,
            synced.external_source == PLAID_EXTERNAL_SOURCE,
            synced.deleted_at.is_(None),
            synced.transaction_type != TRANSACTION_TYPE_TRANSFER,
        )
        .order_by(synced.transaction_date, synced.created_at, on_file.created_at),
    )
    return [(row[0], row[1]) for row in result.all()]
