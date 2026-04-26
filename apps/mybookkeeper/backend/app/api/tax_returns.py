import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)

from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org, require_org_role
from app.models.organization.organization_member import OrgRole
from app.schemas.tax.discrepancy_scan import DiscrepancyScanResult
from app.schemas.tax.document_checklist import DocumentChecklist
from app.schemas.tax.tax_advisor import TaxAdvisorCachedResponse, SuggestionStatusUpdate
from app.schemas.tax.source_document import SourceDocumentsResponse
from app.schemas.tax.tax_form import TaxFormFieldRead, TaxFormFieldUpdate
from app.schemas.tax.tax_return import TaxReturnCreate, TaxReturnRead
from app.schemas.tax.tax_return_responses import (
    FormInstancesResponse,
    FormOverviewItem,
    RecomputeResponse,
    ValidationResultItem,
)
from app.services.tax import (
    discrepancy_scanner_service,
    document_checklist_service,
    tax_advisor_service,
    tax_recompute_service,
    tax_return_service,
    tax_validation_service,
)
from app.services.tax.tax_advisor_service import RateLimitExceeded

router = APIRouter(prefix="/tax-returns", tags=["tax-returns"])


@router.get("", response_model=list[TaxReturnRead])
async def list_tax_returns(
    ctx: RequestContext = Depends(current_org_member),
) -> list[TaxReturnRead]:
    return await tax_return_service.list_returns(ctx)


@router.post("", response_model=TaxReturnRead, status_code=201)
async def create_tax_return(
    body: TaxReturnCreate,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
):
    try:
        return await tax_return_service.create_return(
            ctx, body.tax_year, body.filing_status, body.jurisdiction,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/{return_id}", response_model=TaxReturnRead)
async def get_tax_return(
    return_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
):
    result = await tax_return_service.get_return(ctx, return_id)
    if not result:
        raise HTTPException(status_code=404, detail="Tax return not found")
    return result


@router.delete("/{return_id}", status_code=204)
async def delete_tax_return(
    return_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> None:
    deleted = await tax_return_service.delete_return(ctx, return_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Tax return not found")


@router.get("/{return_id}/source-documents", response_model=SourceDocumentsResponse)
async def get_source_documents(
    return_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> SourceDocumentsResponse:
    try:
        return await tax_return_service.get_source_documents(ctx, return_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{return_id}/document-checklist", response_model=DocumentChecklist)
async def get_document_checklist(
    return_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> DocumentChecklist:
    try:
        return await document_checklist_service.get_checklist(
            ctx.organization_id, return_id,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{return_id}/forms-overview")
async def get_forms_overview(
    return_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> list[FormOverviewItem]:
    """Return distinct form names with instance and field counts."""
    try:
        rows = await tax_return_service.get_forms_overview(ctx, return_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return [FormOverviewItem(**row) for row in rows]


@router.get("/{return_id}/forms/{form_name}")
async def get_form_instances(
    return_id: uuid.UUID,
    form_name: str,
    mask: bool = True,
    ctx: RequestContext = Depends(current_org_member),
) -> FormInstancesResponse:
    # Only owners/admins can request unmasked PII
    if not mask and ctx.org_role not in ("owner", "admin"):
        mask = True
    try:
        result = await tax_return_service.get_form_instances(ctx, return_id, form_name, mask=mask)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return FormInstancesResponse(**result)


@router.post("/{return_id}/recompute")
async def recompute(
    return_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> RecomputeResponse:
    try:
        forms_updated = await tax_recompute_service.recompute(
            ctx.organization_id, return_id,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return RecomputeResponse(status="ok", forms_updated=forms_updated)


@router.patch("/{return_id}/fields/{field_id}", response_model=TaxFormFieldRead)
async def override_field(
    return_id: uuid.UUID,
    field_id: uuid.UUID,
    body: TaxFormFieldUpdate,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
):
    try:
        return await tax_return_service.override_field(
            ctx, return_id, field_id,
            value_numeric=body.value_numeric,
            value_text=body.value_text,
            value_boolean=body.value_boolean,
            override_reason=body.override_reason,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{return_id}/instances/{instance_id}", status_code=204)
async def delete_form_instance(
    return_id: uuid.UUID,
    instance_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> None:
    deleted = await tax_return_service.delete_instance(ctx, return_id, instance_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Form instance not found")


@router.get("/{return_id}/discrepancy-scan", response_model=DiscrepancyScanResult)
async def discrepancy_scan(
    return_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> DiscrepancyScanResult:
    try:
        return await discrepancy_scanner_service.scan(ctx.organization_id, return_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{return_id}/validation")
async def get_validation(
    return_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> list[ValidationResultItem]:
    try:
        results = await tax_validation_service.validate(
            ctx.organization_id, return_id,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return [
        ValidationResultItem(
            severity=r.severity,
            form_name=r.form_name,
            field_id=r.field_id,
            message=r.message,
            expected_value=float(r.expected_value) if r.expected_value is not None else None,
            actual_value=float(r.actual_value) if r.actual_value is not None else None,
        )
        for r in results
    ]


@router.get("/{return_id}/advisor", response_model=TaxAdvisorCachedResponse)
async def get_cached_advice(
    return_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> TaxAdvisorCachedResponse:
    result = await tax_advisor_service.get_cached_advice(ctx.organization_id, return_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No advisor suggestions found for this return")
    return result


@router.post("/{return_id}/advisor/generate", response_model=TaxAdvisorCachedResponse, dependencies=[Depends(reject_demo_org)])
async def generate_advice(
    return_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> TaxAdvisorCachedResponse:
    try:
        return await tax_advisor_service.generate_advice(
            ctx.organization_id, return_id, ctx.user_id,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RateLimitExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception:
        logger.exception("Tax advisor failed for return %s", return_id)
        raise HTTPException(status_code=500, detail="Failed to generate tax advice")


@router.patch("/{return_id}/advisor/{suggestion_id}", response_model=TaxAdvisorCachedResponse)
async def update_suggestion_status(
    return_id: uuid.UUID,
    suggestion_id: uuid.UUID,
    body: SuggestionStatusUpdate,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> TaxAdvisorCachedResponse:
    result = await tax_advisor_service.update_suggestion_status(
        ctx.organization_id, suggestion_id, body.status, ctx.user_id,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    cached = await tax_advisor_service.get_cached_advice(ctx.organization_id, return_id)
    if cached is None:
        raise HTTPException(status_code=404, detail="No advisor suggestions found for this return")
    return cached
