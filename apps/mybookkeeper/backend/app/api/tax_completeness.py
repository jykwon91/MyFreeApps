"""Tax completeness endpoints."""
from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.tax.tax_completeness import TaxCompletenessResponse
from app.services.tax import tax_completeness_service

router = APIRouter(prefix="/tax-completeness", tags=["tax-completeness"])


@router.get("/{tax_year}", response_model=TaxCompletenessResponse)
async def get_tax_completeness(
    tax_year: int,
    ctx: RequestContext = Depends(current_org_member),
) -> TaxCompletenessResponse:
    result = await tax_completeness_service.get_tax_completeness(
        ctx.organization_id, tax_year,
    )
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"No tax return found for {tax_year}",
        )
    return result
