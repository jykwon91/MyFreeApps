import uuid
from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.lease import Lease, LeaseStatus
from app.models.properties.tenant import Tenant


async def list_by_org(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    property_id: uuid.UUID | None = None,
    status: LeaseStatus | None = None,
) -> Sequence[Lease]:
    query = (
        select(Lease)
        .join(Tenant, Lease.tenant_id == Tenant.id)
        .where(Tenant.organization_id == organization_id)
    )
    if property_id:
        query = query.where(Lease.property_id == property_id)
    if status:
        query = query.where(Lease.status == status)
    result = await db.execute(query)
    return result.scalars().all()


async def create(db: AsyncSession, lease: Lease) -> Lease:
    db.add(lease)
    await db.flush()
    return lease


async def create_lease(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    property_id: uuid.UUID,
    start_date: date,
    end_date: date | None,
    monthly_rent: Decimal,
    security_deposit: Decimal,
) -> Lease:
    lease = Lease(
        tenant_id=tenant_id,
        property_id=property_id,
        start_date=start_date,
        end_date=end_date,
        monthly_rent=monthly_rent,
        security_deposit=security_deposit,
    )
    db.add(lease)
    await db.flush()
    return lease
