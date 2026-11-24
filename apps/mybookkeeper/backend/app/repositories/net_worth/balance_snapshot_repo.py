"""Repository for ``balance_snapshots``.

Every read is scoped to the organization AND the user: a snapshot is part of
one person's net worth.

Upsert is select-then-insert/update, the way ``utility_account_link_repo``
does it, so it behaves the same on SQLite (tests) and PostgreSQL. The insert
runs in a savepoint: if another writer (the scheduler and an edit, the same
morning) inserted the same source and day first, the unique index refuses
ours and the row it wrote is updated instead.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import ColumnElement, and_, func, select, union
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.core.net_worth_constants import SOURCE_ACCOUNT, SOURCE_MORTGAGE, SOURCE_PROPERTY
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.mortgage.mortgage import Mortgage
from app.models.net_worth.balance_snapshot import BalanceSnapshot
from app.models.properties.property import Property

_SOURCE_COLUMNS: dict[str, InstrumentedAttribute[uuid.UUID | None]] = {
    SOURCE_ACCOUNT: BalanceSnapshot.financial_account_id,
    SOURCE_MORTGAGE: BalanceSnapshot.mortgage_id,
    SOURCE_PROPERTY: BalanceSnapshot.property_id,
}


def _owner(organization_id: uuid.UUID, user_id: uuid.UUID) -> ColumnElement[bool]:
    return and_(
        BalanceSnapshot.organization_id == organization_id,
        BalanceSnapshot.user_id == user_id,
    )


async def _find(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    snapshot_date: _dt.date,
    source: str,
    source_id: uuid.UUID,
) -> BalanceSnapshot | None:
    result = await db.execute(select(BalanceSnapshot).where(
        _owner(organization_id, user_id),
        BalanceSnapshot.snapshot_date == snapshot_date,
        _SOURCE_COLUMNS[source] == source_id,
    ))
    return result.scalar_one_or_none()


async def upsert(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    snapshot_date: _dt.date,
    source: str,
    source_id: uuid.UUID,
    balance_cents: int,
) -> None:
    """Record ``balance_cents`` as the source's value on ``snapshot_date``."""
    key = {
        "organization_id": organization_id,
        "user_id": user_id,
        "snapshot_date": snapshot_date,
        "source": source,
        "source_id": source_id,
    }
    existing = await _find(db, **key)
    if existing is None:
        try:
            async with db.begin_nested():
                db.add(BalanceSnapshot(
                    organization_id=organization_id,
                    user_id=user_id,
                    snapshot_date=snapshot_date,
                    balance_cents=balance_cents,
                    **{_SOURCE_COLUMNS[source].key: source_id},
                ))
            return
        except IntegrityError:
            existing = await _find(db, **key)
            if existing is None:
                raise
    if existing.balance_cents != balance_cents:
        existing.balance_cents = balance_cents
        await db.flush()


async def list_between(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    start: _dt.date,
    end: _dt.date,
) -> list[BalanceSnapshot]:
    """Every snapshot dated ``start`` through ``end``, oldest first."""
    result = await db.execute(
        select(BalanceSnapshot)
        .where(
            _owner(organization_id, user_id),
            BalanceSnapshot.snapshot_date >= start,
            BalanceSnapshot.snapshot_date <= end,
        )
        .order_by(BalanceSnapshot.snapshot_date)
    )
    return list(result.scalars().all())


async def list_latest_before(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    before: _dt.date,
) -> list[BalanceSnapshot]:
    """Each source's last snapshot before ``before`` — the value it carries
    into a range that starts there."""
    latest = (
        select(
            BalanceSnapshot.financial_account_id,
            BalanceSnapshot.mortgage_id,
            BalanceSnapshot.property_id,
            func.max(BalanceSnapshot.snapshot_date).label("latest_date"),
        )
        .where(_owner(organization_id, user_id), BalanceSnapshot.snapshot_date < before)
        .group_by(
            BalanceSnapshot.financial_account_id,
            BalanceSnapshot.mortgage_id,
            BalanceSnapshot.property_id,
        )
        .subquery()
    )
    result = await db.execute(
        select(BalanceSnapshot)
        .join(latest, and_(
            BalanceSnapshot.financial_account_id.is_not_distinct_from(latest.c.financial_account_id),
            BalanceSnapshot.mortgage_id.is_not_distinct_from(latest.c.mortgage_id),
            BalanceSnapshot.property_id.is_not_distinct_from(latest.c.property_id),
            BalanceSnapshot.snapshot_date == latest.c.latest_date,
        ))
        .where(_owner(organization_id, user_id))
    )
    return list(result.scalars().all())


async def first_date(
    db: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> _dt.date | None:
    result = await db.execute(
        select(func.min(BalanceSnapshot.snapshot_date)).where(_owner(organization_id, user_id))
    )
    return result.scalar_one_or_none()


async def list_owners(db: AsyncSession) -> list[tuple[uuid.UUID, uuid.UUID]]:
    """Every (organization, person) with something that counts toward net
    worth: a live account, a live loan record, or a property with a value."""
    owners = union(
        select(FinancialAccount.organization_id, FinancialAccount.user_id)
        .where(FinancialAccount.deleted_at.is_(None)),
        select(Mortgage.organization_id, Mortgage.user_id)
        .where(Mortgage.deleted_at.is_(None)),
        select(Property.organization_id, Property.user_id)
        .where(Property.estimated_value_cents.is_not(None)),
    )
    result = await db.execute(owners)
    return [(row[0], row[1]) for row in result.all()]
