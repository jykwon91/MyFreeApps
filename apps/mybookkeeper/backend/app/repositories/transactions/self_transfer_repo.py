"""Bank rows that may be one side of money you sent yourself, for
``self_transfer`` to pair. Only live rows a bank feed brought into one of the
workspace's accounts, not yet a transfer and not set aside as a duplicate or
personal transfer."""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Mapping, Sequence

from sqlalchemy import ColumnElement, Row, Select, and_, false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bank_feed_sources import BANK_FEED_SOURCES
from app.core.monthly_expense_constants import PFC_TRANSFER_OUT
from app.core.plaid_category_constants import PFC_TRANSFER_PRIMARIES
from app.core.tags import TRANSACTION_TYPE_EXPENSE, TRANSACTION_TYPE_INCOME
from app.core.transaction_statuses import NOT_MONEY_STATUSES
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.transactions.transaction import Transaction
from app.repositories.transactions.transfer_leg import TransferLeg


async def list_account_holder_ids(db: AsyncSession, *, organization_id: uuid.UUID) -> list[uuid.UUID]:
    """Everyone who holds one of the workspace's accounts."""
    result = await db.execute(
        select(FinancialAccount.user_id).where(FinancialAccount.organization_id == organization_id).distinct(),
    )
    return list(result.scalars().all())


def _legs_stmt(organization_id: uuid.UUID, *conditions: ColumnElement[bool]) -> Select:
    return (
        select(
            Transaction.id,
            Transaction.account_id,
            FinancialAccount.institution_name,
            FinancialAccount.user_id,
            Transaction.amount,
            Transaction.transaction_date,
            Transaction.description,
            Transaction.vendor,
            Transaction.external_category,
        )
        .join(FinancialAccount, FinancialAccount.id == Transaction.account_id)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
            Transaction.status.not_in(NOT_MONEY_STATUSES),
            Transaction.external_source.in_(BANK_FEED_SOURCES),
            *conditions,
        )
        .order_by(Transaction.transaction_date, Transaction.id)
    )


def _to_legs(rows: Sequence[Row], holder_names: Mapping[uuid.UUID, str]) -> list[TransferLeg]:
    return [
        TransferLeg(
            id=row_id, account_id=account_id, account_institution=institution, account_user_id=user_id,
            holder_name=holder_names.get(user_id), amount=amount, transaction_date=transaction_date,
            description=description, vendor=vendor, external_category=external_category,
        )
        for (
            row_id, account_id, institution, user_id, amount,
            transaction_date, description, vendor, external_category,
        ) in rows
    ]


def _names_own_holder(holder_names: Mapping[uuid.UUID, str]) -> ColumnElement[bool]:
    """The row is on an account of someone ``holder_names`` lists and carries
    their name. The rule checks again, word by word."""
    per_holder = [
        and_(
            FinancialAccount.user_id == user_id,
            or_(
                Transaction.description.icontains(name, autoescape=True),
                Transaction.vendor.icontains(name, autoescape=True),
            ),
        )
        for user_id, name in holder_names.items()
    ]
    return or_(*per_holder) if per_holder else false()


async def list_sent_legs(
    db: AsyncSession, *, organization_id: uuid.UUID, holder_names: Mapping[uuid.UUID, str],
) -> list[TransferLeg]:
    """Money out that names the account's holder — the only rows that can be
    money sent to themselves."""
    result = await db.execute(_legs_stmt(
        organization_id,
        Transaction.transaction_type == TRANSACTION_TYPE_EXPENSE,
        or_(Transaction.external_category == PFC_TRANSFER_OUT, Transaction.external_category.is_(None)),
        _names_own_holder(holder_names),
    ))
    return _to_legs(result.all(), holder_names)


async def list_received_legs(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    holder_names: Mapping[uuid.UUID, str],
    date_from: _dt.date,
    date_to: _dt.date,
) -> list[TransferLeg]:
    """Money in, dated between ``date_from`` and ``date_to``, that the bank
    called a transfer or gave no category."""
    result = await db.execute(_legs_stmt(
        organization_id,
        Transaction.transaction_type == TRANSACTION_TYPE_INCOME,
        or_(
            Transaction.external_category.in_(list(PFC_TRANSFER_PRIMARIES)),
            Transaction.external_category.is_(None),
        ),
        Transaction.transaction_date.between(date_from, date_to),
    ))
    return _to_legs(result.all(), holder_names)
