import uuid
from datetime import date
from decimal import Decimal

from app.core.context import RequestContext
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.properties.lease import Lease, LeaseStatus
from app.models.properties.tenant import Tenant
from app.repositories import lease_repo, property_repo, tenant_repo


async def list_tenants(
    ctx: RequestContext,
    property_id: uuid.UUID | None = None,
) -> list[Tenant]:
    async with AsyncSessionLocal() as db:
        result = await tenant_repo.list_by_org(db, ctx.organization_id, property_id=property_id)
        return list(result)


async def create_tenant(
    ctx: RequestContext,
    property_id: uuid.UUID,
    name: str,
    email: str | None = None,
    phone: str | None = None,
) -> Tenant | None:
    """Returns None if property not found."""
    async with unit_of_work() as db:
        prop = await property_repo.get_by_id(db, property_id, ctx.organization_id)
        if not prop:
            return None

        return await tenant_repo.create_tenant(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            property_id=property_id,
            name=name,
            email=email,
            phone=phone,
        )


async def create_lease(
    ctx: RequestContext,
    tenant_id: uuid.UUID,
    property_id: uuid.UUID,
    start_date: date,
    end_date: date | None,
    monthly_rent: Decimal,
    security_deposit: Decimal,
) -> Lease | None:
    """Returns None if tenant or property not found."""
    async with unit_of_work() as db:
        tenant = await tenant_repo.get_by_id(db, tenant_id, ctx.organization_id)
        if not tenant:
            return None

        prop = await property_repo.get_by_id(db, property_id, ctx.organization_id)
        if not prop:
            return None

        return await lease_repo.create_lease(
            db,
            tenant_id=tenant_id,
            property_id=property_id,
            start_date=start_date,
            end_date=end_date,
            monthly_rent=monthly_rent,
            security_deposit=security_deposit,
        )


async def list_leases(
    ctx: RequestContext,
    property_id: uuid.UUID | None = None,
    status: LeaseStatus | None = None,
) -> list[Lease]:
    async with AsyncSessionLocal() as db:
        result = await lease_repo.list_by_org(
            db, ctx.organization_id, property_id=property_id, status=status,
        )
        return list(result)
