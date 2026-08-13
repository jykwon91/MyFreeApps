"""HTTP routes for insurance policies.

Route prefix: /insurance-policies.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.core.rate_limit import insurance_policy_extract_limiter
from app.core.upload_errors import upload_error_status
from app.schemas.insurance.insurance_policy_attachment_response import (
    InsurancePolicyAttachmentResponse,
)
from app.schemas.insurance.insurance_policy_create_request import (
    InsurancePolicyCreateRequest,
)
from app.schemas.insurance.insurance_policy_draft import InsurancePolicyDraft
from app.schemas.insurance.insurance_policy_extract_request import (
    InsurancePolicyExtractRequest,
)
from app.schemas.insurance.insurance_policy_list_response import (
    InsurancePolicyListResponse,
)
from app.schemas.insurance.insurance_policy_premium_comparison_response import (
    InsurancePolicyPremiumComparisonResponse,
)
from app.schemas.insurance.insurance_policy_response import InsurancePolicyResponse
from app.schemas.insurance.insurance_policy_update_request import (
    InsurancePolicyUpdateRequest,
)
from app.services.insurance import (
    insurance_benchmark_service,
    insurance_policy_extraction_service,
    insurance_policy_service,
)

router = APIRouter(prefix="/insurance-policies", tags=["insurance-policies"])

_DOCUMENT_NOT_FOUND_DETAIL = "Document not found"


@router.post("", response_model=InsurancePolicyResponse, status_code=201)
async def create_policy(
    payload: InsurancePolicyCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> InsurancePolicyResponse:
    return await insurance_policy_service.create_policy(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        listing_id=payload.listing_id,
        source_document_id=payload.source_document_id,
        policy_name=payload.policy_name,
        carrier=payload.carrier,
        policy_number=payload.policy_number,
        effective_date=payload.effective_date,
        expiration_date=payload.expiration_date,
        coverage_amount_cents=payload.coverage_amount_cents,
        premium_cents=payload.premium_cents,
        premium_frequency=payload.premium_frequency,
        deductible_cents=payload.deductible_cents,
        wind_hail_deductible_pct=payload.wind_hail_deductible_pct,
        notes=payload.notes,
    )


@router.post("/extract", response_model=InsurancePolicyDraft)
async def extract_policy_from_document(
    payload: InsurancePolicyExtractRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> InsurancePolicyDraft:
    """Read policy terms out of a document the caller already uploaded.

    Nothing is saved — the response prefills the create form, and the operator
    still reviews it. Declared before ``/{policy_id}`` so the literal path is
    not swallowed by the UUID route.
    """
    insurance_policy_extract_limiter.check(f"insurance-policy-extract:{ctx.user_id}")
    try:
        return await insurance_policy_extraction_service.extract_policy_from_document(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            document_id=payload.document_id,
        )
    except insurance_policy_extraction_service.DocumentNotFoundError as exc:
        raise HTTPException(
            status_code=404, detail=_DOCUMENT_NOT_FOUND_DETAIL,
        ) from exc
    except insurance_policy_extraction_service.UnreadableDocumentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/extract-upload", response_model=InsurancePolicyDraft)
async def extract_policy_from_upload(
    file: UploadFile = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> InsurancePolicyDraft:
    """Store a file the caller just picked and read policy terms out of it.

    The one-request form of ``/extract``, for callers holding bytes rather than
    a document id — a phone photographing a declarations page has nothing in
    the library to point at. The file is kept as reference material, so no
    transaction is invented from the premium printed on it. No policy is saved;
    the response prefills the create form. Declared before ``/{policy_id}`` so
    the literal path is not swallowed by the UUID route.
    """
    insurance_policy_extract_limiter.check(f"insurance-policy-extract:{ctx.user_id}")
    content = await file.read()
    try:
        return await insurance_policy_extraction_service.extract_policy_from_upload(
            ctx=ctx,
            content=content,
            filename=file.filename or "",
            content_type=file.content_type or "",
        )
    # UnreadableDocumentError is a ValueError, so it has to be caught first or
    # the upload-rejection mapping below would swallow it.
    except insurance_policy_extraction_service.UnreadableDocumentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        msg = str(exc)
        raise HTTPException(
            status_code=upload_error_status(msg), detail=msg,
        ) from exc


@router.get("", response_model=InsurancePolicyListResponse)
async def list_policies(
    listing_id: uuid.UUID | None = Query(None),
    expiring_before: _dt.date | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> InsurancePolicyListResponse:
    return await insurance_policy_service.list_policies(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        listing_id=listing_id,
        expiring_before=expiring_before,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/premium-comparison", response_model=InsurancePolicyPremiumComparisonResponse,
)
async def get_premium_comparison(
    ctx: RequestContext = Depends(current_org_member),
) -> InsurancePolicyPremiumComparisonResponse:
    """Unexpired policies priced materially above the recorded benchmark.

    Lives on the policy resource rather than the benchmark one because it
    returns policies. Declared before ``/{policy_id}`` so the literal path is
    not swallowed by the UUID route.
    """
    return await insurance_benchmark_service.get_premium_comparison(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
    )


@router.get("/{policy_id}", response_model=InsurancePolicyResponse)
async def get_policy(
    policy_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> InsurancePolicyResponse:
    try:
        return await insurance_policy_service.get_policy(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            policy_id=policy_id,
        )
    except insurance_policy_service.InsurancePolicyNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Insurance policy not found") from exc


@router.patch("/{policy_id}", response_model=InsurancePolicyResponse)
async def update_policy(
    policy_id: uuid.UUID,
    payload: InsurancePolicyUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> InsurancePolicyResponse:
    # Build field dict from only the explicitly-provided fields.
    # Using model_dump(exclude_unset=True) preserves the distinction between
    # "field omitted" and "field set to null".
    raw: dict[str, Any] = payload.model_dump(exclude_unset=True)
    if not raw:
        # Nothing to update — just return current state.
        try:
            return await insurance_policy_service.get_policy(
                user_id=ctx.user_id,
                organization_id=ctx.organization_id,
                policy_id=policy_id,
            )
        except insurance_policy_service.InsurancePolicyNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Insurance policy not found") from exc

    try:
        return await insurance_policy_service.update_policy(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            policy_id=policy_id,
            fields=raw,
        )
    except insurance_policy_service.InsurancePolicyNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Insurance policy not found") from exc
    except insurance_policy_service.InvalidInsurancePolicyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{policy_id}", status_code=204)
async def delete_policy(
    policy_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await insurance_policy_service.soft_delete_policy(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            policy_id=policy_id,
        )
    except insurance_policy_service.InsurancePolicyNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Insurance policy not found") from exc
    return Response(status_code=204)


@router.post(
    "/{policy_id}/attachments",
    response_model=InsurancePolicyAttachmentResponse,
    status_code=201,
)
async def upload_attachment(
    policy_id: uuid.UUID,
    kind: str = Form(...),
    file: UploadFile = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> InsurancePolicyAttachmentResponse:
    content = await file.read()
    try:
        return await insurance_policy_service.upload_attachment(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            policy_id=policy_id,
            content=content,
            filename=file.filename or "",
            declared_content_type=file.content_type,
            kind=kind,
        )
    except insurance_policy_service.InsurancePolicyNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Insurance policy not found") from exc
    except insurance_policy_service.AttachmentTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except insurance_policy_service.AttachmentTypeRejectedError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except insurance_policy_service.InvalidAttachmentKindError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete(
    "/{policy_id}/attachments/{attachment_id}",
    status_code=204,
)
async def delete_attachment(
    policy_id: uuid.UUID,
    attachment_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await insurance_policy_service.delete_attachment(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            policy_id=policy_id,
            attachment_id=attachment_id,
        )
    except (
        insurance_policy_service.InsurancePolicyNotFoundError,
        insurance_policy_service.AttachmentNotFoundError,
    ) as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    return Response(status_code=204)
