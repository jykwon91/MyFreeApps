from typing import Literal

from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import require_org_role
from app.models.organization.organization_member import OrgRole
from app.schemas.organization.taxpayer_profile import TaxpayerProfileRead, TaxpayerProfileWrite
from app.services.organization import taxpayer_profile_service

router = APIRouter(prefix="/taxpayer-profiles", tags=["taxpayer-profiles"])

FilerType = Literal["primary", "spouse"]


@router.get("/{filer_type}", response_model=TaxpayerProfileRead)
async def get_taxpayer_profile(
    filer_type: FilerType,
    include_ssn: bool = False,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> TaxpayerProfileRead:
    result = await taxpayer_profile_service.get_profile(
        ctx.organization_id,
        ctx.user_id,
        filer_type,
        include_ssn=include_ssn,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Taxpayer profile not found")
    return TaxpayerProfileRead(**result)


@router.put("/{filer_type}", response_model=TaxpayerProfileRead)
async def upsert_taxpayer_profile(
    filer_type: FilerType,
    body: TaxpayerProfileWrite,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> TaxpayerProfileRead:
    try:
        result = await taxpayer_profile_service.upsert_profile(
            ctx.organization_id,
            ctx.user_id,
            filer_type,
            body.model_dump(exclude_unset=True),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return TaxpayerProfileRead(**result)


@router.delete("/{filer_type}", status_code=204)
async def delete_taxpayer_profile(
    filer_type: FilerType,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> None:
    deleted = await taxpayer_profile_service.delete_profile(
        ctx.organization_id,
        ctx.user_id,
        filer_type,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Taxpayer profile not found")
