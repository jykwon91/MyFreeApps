from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_org_role
from app.models.organization.organization_member import OrgRole
from app.schemas.tax.tax_year_profile import TaxYearProfileRead, TaxYearProfileUpdate
from app.services.tax import tax_year_profile_service

router = APIRouter(prefix="/tax-year-profiles", tags=["tax-year-profiles"])


@router.get("", response_model=list[TaxYearProfileRead])
async def list_tax_year_profiles(
    ctx: RequestContext = Depends(current_org_member),
) -> list[TaxYearProfileRead]:
    profiles = await tax_year_profile_service.list_for_org(ctx.organization_id)
    return [TaxYearProfileRead.model_validate(p) for p in profiles]


@router.get("/{tax_year}", response_model=TaxYearProfileRead)
async def get_tax_year_profile(
    tax_year: int,
    ctx: RequestContext = Depends(current_org_member),
) -> TaxYearProfileRead:
    profile = await tax_year_profile_service.get_or_create(ctx.organization_id, tax_year)
    return TaxYearProfileRead.model_validate(profile)


@router.put("/{tax_year}", response_model=TaxYearProfileRead)
async def update_tax_year_profile(
    tax_year: int,
    body: TaxYearProfileUpdate,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> TaxYearProfileRead:
    try:
        profile = await tax_year_profile_service.update_profile(
            ctx.organization_id,
            tax_year,
            body.model_dump(exclude_unset=True),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return TaxYearProfileRead.model_validate(profile)
