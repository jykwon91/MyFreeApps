"""Repository for ``vendors`` — owns every query against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. All public functions filter by
``organization_id`` AND ``user_id`` — the dual scope is mandatory per
RENTALS_PLAN.md §8.1.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import delete as _sa_delete
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vendors.vendor import Vendor


async def create(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str,
    category: str,
    phone: str | None = None,
    email: str | None = None,
    address: str | None = None,
    hourly_rate: Decimal | None = None,
    flat_rate_notes: str | None = None,
    preferred: bool = False,
    notes: str | None = None,
) -> Vendor:
    """Persist a Vendor."""
    vendor = Vendor(
        organization_id=organization_id,
        user_id=user_id,
        name=name,
        category=category,
        phone=phone,
        email=email,
        address=address,
        hourly_rate=hourly_rate,
        flat_rate_notes=flat_rate_notes,
        preferred=preferred,
        notes=notes,
    )
    db.add(vendor)
    await db.flush()
    return vendor


async def get_by_id(
    db: AsyncSession,
    *,
    vendor_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    include_deleted: bool = False,
) -> Vendor | None:
    """Return the vendor iff it belongs to (organization_id, user_id).

    Defaults to skipping soft-deleted rows. Set ``include_deleted=True`` from
    admin contexts that need to resolve historical
    ``Transaction.vendor_id`` references after the host has soft-deleted the
    vendor (the FK in PR 4.2 will be ``ON DELETE SET NULL`` for hard deletes,
    but soft-deleted rows still satisfy the FK).
    """
    stmt = select(Vendor).where(
        Vendor.id == vendor_id,
        Vendor.organization_id == organization_id,
        Vendor.user_id == user_id,
    )
    if not include_deleted:
        stmt = stmt.where(Vendor.deleted_at.is_(None))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_by_organization(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    category: str | None = None,
    preferred: bool | None = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[Vendor]:
    """List vendors for (organization_id, user_id). Newest first."""
    stmt = select(Vendor).where(
        Vendor.organization_id == organization_id,
        Vendor.user_id == user_id,
    )
    if not include_deleted:
        stmt = stmt.where(Vendor.deleted_at.is_(None))
    if category is not None:
        stmt = stmt.where(Vendor.category == category)
    if preferred is not None:
        stmt = stmt.where(Vendor.preferred.is_(preferred))
    stmt = stmt.order_by(desc(Vendor.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_by_organization(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    category: str | None = None,
    preferred: bool | None = None,
    include_deleted: bool = False,
) -> int:
    """Count vendors for (organization_id, user_id) — used for paginated totals."""
    stmt = select(func.count()).select_from(Vendor).where(
        Vendor.organization_id == organization_id,
        Vendor.user_id == user_id,
    )
    if not include_deleted:
        stmt = stmt.where(Vendor.deleted_at.is_(None))
    if category is not None:
        stmt = stmt.where(Vendor.category == category)
    if preferred is not None:
        stmt = stmt.where(Vendor.preferred.is_(preferred))
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def soft_delete(
    db: AsyncSession,
    *,
    vendor_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Soft-delete a vendor. Returns True iff a row was updated."""
    result = await db.execute(
        update(Vendor)
        .where(
            Vendor.id == vendor_id,
            Vendor.organization_id == organization_id,
            Vendor.user_id == user_id,
            Vendor.deleted_at.is_(None),
        )
        .values(deleted_at=_dt.datetime.now(_dt.timezone.utc))
    )
    return (result.rowcount or 0) > 0


async def hard_delete_by_id(
    db: AsyncSession,
    *,
    vendor_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Hard-delete a vendor scoped to (organization_id, user_id).

    Test-utility only — production code uses :func:`soft_delete`. The dual
    scope check is performed inline so cross-tenant cleanup attempts no-op
    instead of removing data the caller does not own.
    """
    await db.execute(
        _sa_delete(Vendor).where(
            Vendor.id == vendor_id,
            Vendor.organization_id == organization_id,
            Vendor.user_id == user_id,
        )
    )
