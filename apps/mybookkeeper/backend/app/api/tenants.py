import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.models.properties.lease import LeaseStatus
from app.models.requests.tenant_create import TenantCreate
from app.models.requests.lease_create import LeaseCreate
from app.schemas.properties.tenant import TenantRead
from app.schemas.properties.lease import LeaseRead
from app.services.properties import tenant_service

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("", response_model=list[TenantRead])
async def list_tenants(
    property_id: Optional[uuid.UUID] = None,
    ctx: RequestContext = Depends(current_org_member),
) -> list[TenantRead]:
    return await tenant_service.list_tenants(ctx, property_id=property_id)


@router.post("", response_model=TenantRead)
async def create_tenant(
    data: TenantCreate,
    ctx: RequestContext = Depends(require_write_access),
):
    result = await tenant_service.create_tenant(
        ctx, data.property_id, data.name, data.email, data.phone,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Property not found")
    return result


@router.post("/leases", response_model=LeaseRead)
async def create_lease(
    data: LeaseCreate,
    ctx: RequestContext = Depends(require_write_access),
):
    result = await tenant_service.create_lease(
        ctx,
        data.tenant_id, data.property_id, data.start_date, data.end_date,
        data.monthly_rent, data.security_deposit,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Tenant or property not found")
    return result


@router.get("/leases", response_model=list[LeaseRead])
async def list_leases(
    property_id: Optional[uuid.UUID] = None,
    status: Optional[LeaseStatus] = None,
    ctx: RequestContext = Depends(current_org_member),
) -> list[LeaseRead]:
    return await tenant_service.list_leases(
        ctx, property_id=property_id, status=status,
    )
