"""Repository for ``signed_leases``."""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.signed_lease import SignedLease


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    template_id: uuid.UUID | None,
    applicant_id: uuid.UUID,
    listing_id: uuid.UUID | None,
    values: dict[str, Any],
    starts_on: _dt.date | None,
    ends_on: _dt.date | None,
    status: str = "draft",
    kind: str = "generated",
) -> SignedLease:
    lease = SignedLease(
        user_id=user_id,
        organization_id=organization_id,
        template_id=template_id,
        applicant_id=applicant_id,
        listing_id=listing_id,
        values=values,
        starts_on=starts_on,
        ends_on=ends_on,
        status=status,
        kind=kind,
    )
    db.add(lease)
    await db.flush()
    return lease


async def get(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    include_deleted: bool = False,
) -> SignedLease | None:
    stmt = select(SignedLease).where(
        SignedLease.id == lease_id,
        SignedLease.user_id == user_id,
        SignedLease.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(SignedLease.deleted_at.is_(None))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_for_tenant(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID | None = None,
    listing_id: uuid.UUID | None = None,
    status: str | None = None,
    starts_after: _dt.date | None = None,
    starts_before: _dt.date | None = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[SignedLease]:
    stmt = select(SignedLease).where(
        SignedLease.user_id == user_id,
        SignedLease.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(SignedLease.deleted_at.is_(None))
    if applicant_id is not None:
        stmt = stmt.where(SignedLease.applicant_id == applicant_id)
    if listing_id is not None:
        stmt = stmt.where(SignedLease.listing_id == listing_id)
    if status is not None:
        stmt = stmt.where(SignedLease.status == status)
    if starts_after is not None:
        stmt = stmt.where(SignedLease.starts_on >= starts_after)
    if starts_before is not None:
        stmt = stmt.where(SignedLease.starts_on <= starts_before)
    stmt = stmt.order_by(desc(SignedLease.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_for_tenant(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID | None = None,
    listing_id: uuid.UUID | None = None,
    status: str | None = None,
    include_deleted: bool = False,
) -> int:
    stmt = select(func.count()).select_from(SignedLease).where(
        SignedLease.user_id == user_id,
        SignedLease.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(SignedLease.deleted_at.is_(None))
    if applicant_id is not None:
        stmt = stmt.where(SignedLease.applicant_id == applicant_id)
    if listing_id is not None:
        stmt = stmt.where(SignedLease.listing_id == listing_id)
    if status is not None:
        stmt = stmt.where(SignedLease.status == status)
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def has_active_lease_for_template(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
) -> bool:
    """Used by the soft-delete-template flow to enforce 409 on conflict."""
    result = await db.execute(
        select(func.count()).select_from(SignedLease).where(
            SignedLease.template_id == template_id,
            SignedLease.deleted_at.is_(None),
        )
    )
    return int(result.scalar_one()) > 0


async def update_lease(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    fields: dict[str, Any],
) -> SignedLease | None:
    lease = await get(
        db,
        lease_id=lease_id,
        user_id=user_id,
        organization_id=organization_id,
    )
    if lease is None:
        return None
    for key, value in fields.items():
        setattr(lease, key, value)
    await db.flush()
    return lease


async def soft_delete(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        update(SignedLease)
        .where(
            SignedLease.id == lease_id,
            SignedLease.user_id == user_id,
            SignedLease.organization_id == organization_id,
            SignedLease.deleted_at.is_(None),
        )
        .values(deleted_at=_dt.datetime.now(_dt.timezone.utc))
    )
    return (result.rowcount or 0) > 0
