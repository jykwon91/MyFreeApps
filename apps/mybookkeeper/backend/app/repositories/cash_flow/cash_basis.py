"""Which rows a cash view counts: money that moved through an account.

A row with no account — a bill or a property manager's statement read from an
email or document, or one typed in by hand — is paperwork about money. Once a
bank feed is connected, the money itself arrives from the bank: the payout
Vello deposits, the autopay that settles the AT&T bill. Both cannot count, and
they rarely match on amount or date (a statement shows the gross rent, the
deposit is the net; a bill is dated weeks before it is paid), so they can't be
paired up. The account's row is the one counted.

So from the first day any bank feed covers (the bank history start), a cash
view counts only rows in an account. Before it, there is nothing from the bank
to stand in, so every row counts — as it does for a workspace with no bank
feed at all. Money paid in cash counts when it is filed on a cash account.

The rental and tax figures (Dashboard, Schedule E) are not a cash view and
keep counting the statements; they never use this.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bank_feed_sources import BANK_FEED_SOURCES
from app.models.transactions.transaction import Transaction


async def bank_history_start(db: AsyncSession, *, organization_id: uuid.UUID) -> _dt.date | None:
    """The earliest day a bank feed has a row for in one of the workspace's
    accounts, or None when no bank feed has brought anything in. Deleted rows
    count: the feed still covered their day."""
    result = await db.execute(
        select(func.min(Transaction.transaction_date)).where(
            Transaction.organization_id == organization_id,
            Transaction.account_id.is_not(None),
            Transaction.external_source.in_(BANK_FEED_SOURCES),
        )
    )
    return result.scalar_one_or_none()


def cash_basis_filters(history_start: _dt.date | None) -> list[ColumnElement[bool]]:
    """The rows a cash view counts, given the bank history start."""
    if history_start is None:
        return []
    return [or_(Transaction.account_id.is_not(None), Transaction.transaction_date < history_start)]
