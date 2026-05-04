"""Repository for ``insurance_policies``."""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.insurance.insurance_policy import InsurancePolicy


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    listing_id: uuid.UUID,
    policy_name: str,
    carrier: str | None = None,
    policy_number: str | None = None,
    effective_date: _dt.date | None = None,
    expiration_date: _dt.date | None = None,
    coverage_amount_cents: int | None = None,
    notes: str | None = None,
) -> InsurancePolicy:
    policy = InsurancePolicy(
        user_id=user_id,
        organization_id=organization_id,
        listing_id=listing_id,
        policy_name=policy_name,
        carrier=carrier,
        policy_number=policy_number,
        effective_date=effective_date,
        expiration_date=expiration_date,
        coverage_amount_cents=coverage_amount_cents,
        notes=notes,
    )
    db.add(policy)
    await db.flush()
    return policy


async def get(
    db: AsyncSession,
    *,
    policy_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    include_deleted: bool = False,
) -> InsurancePolicy | None:
    stmt = select(InsurancePolicy).where(
        InsurancePolicy.id == policy_id,
        InsurancePolicy.user_id == user_id,
        InsurancePolicy.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(InsurancePolicy.deleted_at.is_(None))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_for_org(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    listing_id: uuid.UUID | None = None,
    expiring_before: _dt.date | None = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[InsurancePolicy]:
    stmt = select(InsurancePolicy).where(
        InsurancePolicy.user_id == user_id,
        InsurancePolicy.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(InsurancePolicy.deleted_at.is_(None))
    if listing_id is not None:
        stmt = stmt.where(InsurancePolicy.listing_id == listing_id)
    if expiring_before is not None:
        stmt = stmt.where(
            InsurancePolicy.expiration_date.isnot(None),
            InsurancePolicy.expiration_date <= expiring_before,
        )
    stmt = stmt.order_by(desc(InsurancePolicy.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_for_org(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    listing_id: uuid.UUID | None = None,
    expiring_before: _dt.date | None = None,
    include_deleted: bool = False,
) -> int:
    stmt = select(func.count()).select_from(InsurancePolicy).where(
        InsurancePolicy.user_id == user_id,
        InsurancePolicy.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(InsurancePolicy.deleted_at.is_(None))
    if listing_id is not None:
        stmt = stmt.where(InsurancePolicy.listing_id == listing_id)
    if expiring_before is not None:
        stmt = stmt.where(
            InsurancePolicy.expiration_date.isnot(None),
            InsurancePolicy.expiration_date <= expiring_before,
        )
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def update_policy(
    db: AsyncSession,
    *,
    policy_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    fields: dict[str, Any],
) -> InsurancePolicy | None:
    policy = await get(
        db,
        policy_id=policy_id,
        user_id=user_id,
        organization_id=organization_id,
    )
    if policy is None:
        return None
    for key, value in fields.items():
        setattr(policy, key, value)
    await db.flush()
    return policy


async def soft_delete(
    db: AsyncSession,
    *,
    policy_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        update(InsurancePolicy)
        .where(
            InsurancePolicy.id == policy_id,
            InsurancePolicy.user_id == user_id,
            InsurancePolicy.organization_id == organization_id,
            InsurancePolicy.deleted_at.is_(None),
        )
        .values(deleted_at=_dt.datetime.now(_dt.timezone.utc))
    )
    return (result.rowcount or 0) > 0
