from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_org_role
from app.models.organization.organization_member import OrgRole
from app.schemas.organization.tax_profile import TaxProfileOnboardingComplete, TaxProfileRead, TaxProfileUpdate
from app.services.organization import tax_profile_service

router = APIRouter(prefix="/tax-profile", tags=["tax-profile"])


@router.get("", response_model=TaxProfileRead)
async def get_tax_profile(
    ctx: RequestContext = Depends(current_org_member),
) -> TaxProfileRead:
    profile = await tax_profile_service.get_or_create_profile(ctx.organization_id)
    return TaxProfileRead.model_validate(profile)


@router.put("", response_model=TaxProfileRead)
async def update_tax_profile(
    body: TaxProfileUpdate,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> TaxProfileRead:
    try:
        profile = await tax_profile_service.update_profile(
            ctx.organization_id,
            body.model_dump(exclude_unset=True),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return TaxProfileRead.model_validate(profile)


@router.post("/complete-onboarding", response_model=TaxProfileRead)
async def complete_onboarding(
    body: TaxProfileOnboardingComplete,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> TaxProfileRead:
    profile = await tax_profile_service.complete_onboarding(
        ctx.organization_id,
        tax_situations=body.tax_situations,
        filing_status=body.filing_status,
        dependents_count=body.dependents_count,
    )
    return TaxProfileRead.model_validate(profile)
