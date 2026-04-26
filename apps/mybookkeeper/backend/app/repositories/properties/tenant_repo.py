import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.tenant import Tenant


async def list_by_org(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    property_id: uuid.UUID | None = None,
) -> Sequence[Tenant]:
    query = select(Tenant).where(Tenant.organization_id == organization_id)
    if property_id:
        query = query.where(Tenant.property_id == property_id)
    result = await db.execute(query)
    return result.scalars().all()


async def get_by_id(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> Tenant | None:
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id, Tenant.organization_id == organization_id)
    )
    return result.scalar_one_or_none()


async def create(db: AsyncSession, tenant: Tenant) -> Tenant:
    db.add(tenant)
    await db.flush()
    return tenant


async def create_tenant(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    name: str,
    email: str | None = None,
    phone: str | None = None,
) -> Tenant:
    tenant = Tenant(
        organization_id=organization_id,
        user_id=user_id,
        property_id=property_id,
        name=name,
        email=email,
        phone=phone,
    )
    db.add(tenant)
    await db.flush()
    return tenant
