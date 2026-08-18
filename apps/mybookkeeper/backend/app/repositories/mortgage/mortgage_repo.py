"""Repository for ``mortgages``."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mortgage.mortgage import Mortgage
from app.models.properties.property import Property


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_id: uuid.UUID,
    rate_type: str,
    source_document_id: uuid.UUID | None = None,
    lender: str | None = None,
    account_number: str | None = None,
    current_balance_cents: int | None = None,
    statement_date: _dt.date | None = None,
    original_principal_cents: int | None = None,
    interest_rate: Decimal | None = None,
    fixed_until: _dt.date | None = None,
    maturity_date: _dt.date | None = None,
    term_months: int | None = None,
    monthly_principal_cents: int | None = None,
    monthly_interest_cents: int | None = None,
    monthly_escrow_cents: int | None = None,
    notes: str | None = None,
) -> Mortgage:
    mortgage = Mortgage(
        user_id=user_id,
        organization_id=organization_id,
        property_id=property_id,
        source_document_id=source_document_id,
        lender=lender,
        account_number=account_number,
        current_balance_cents=current_balance_cents,
        statement_date=statement_date,
        original_principal_cents=original_principal_cents,
        interest_rate=interest_rate,
        rate_type=rate_type,
        fixed_until=fixed_until,
        maturity_date=maturity_date,
        term_months=term_months,
        monthly_principal_cents=monthly_principal_cents,
        monthly_interest_cents=monthly_interest_cents,
        monthly_escrow_cents=monthly_escrow_cents,
        notes=notes,
    )
    db.add(mortgage)
    await db.flush()
    return mortgage


async def get(
    db: AsyncSession,
    *,
    mortgage_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    include_deleted: bool = False,
) -> Mortgage | None:
    stmt = select(Mortgage).where(
        Mortgage.id == mortgage_id,
        Mortgage.user_id == user_id,
        Mortgage.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(Mortgage.deleted_at.is_(None))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_for_org(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_id: uuid.UUID | None = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[Mortgage]:
    stmt = select(Mortgage).where(
        Mortgage.user_id == user_id,
        Mortgage.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(Mortgage.deleted_at.is_(None))
    if property_id is not None:
        stmt = stmt.where(Mortgage.property_id == property_id)
    stmt = stmt.order_by(desc(Mortgage.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_for_org(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_id: uuid.UUID | None = None,
    include_deleted: bool = False,
) -> int:
    stmt = select(func.count()).select_from(Mortgage).where(
        Mortgage.user_id == user_id,
        Mortgage.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(Mortgage.deleted_at.is_(None))
    if property_id is not None:
        stmt = stmt.where(Mortgage.property_id == property_id)
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def list_with_properties(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[tuple[Mortgage, Property]]:
    """Every active loan paired with the property securing it.

    Joined rather than loaded per row because the rate check needs the
    property's name AND its classification for every loan — the classification
    decides which comparable rate applies, so it is not optional context.
    """
    stmt = (
        select(Mortgage, Property)
        .join(Property, Property.id == Mortgage.property_id)
        .where(
            Mortgage.user_id == user_id,
            Mortgage.organization_id == organization_id,
            Mortgage.deleted_at.is_(None),
        )
        .order_by(desc(Mortgage.created_at))
    )
    result = await db.execute(stmt)
    return [(row[0], row[1]) for row in result.all()]


async def update_mortgage(
    db: AsyncSession,
    *,
    mortgage_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    fields: dict[str, Any],
) -> Mortgage | None:
    mortgage = await get(
        db,
        mortgage_id=mortgage_id,
        user_id=user_id,
        organization_id=organization_id,
    )
    if mortgage is None:
        return None
    for key, value in fields.items():
        setattr(mortgage, key, value)
    await db.flush()
    return mortgage


async def soft_delete(
    db: AsyncSession,
    *,
    mortgage_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        update(Mortgage)
        .where(
            Mortgage.id == mortgage_id,
            Mortgage.user_id == user_id,
            Mortgage.organization_id == organization_id,
            Mortgage.deleted_at.is_(None),
        )
        .values(deleted_at=_dt.datetime.now(_dt.timezone.utc))
    )
    return (result.rowcount or 0) > 0
