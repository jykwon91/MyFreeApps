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
from app.schemas.insurance.insurance_policy_attachment_response import (
    InsurancePolicyAttachmentResponse,
)
from app.schemas.insurance.insurance_policy_create_request import (
    InsurancePolicyCreateRequest,
)
from app.schemas.insurance.insurance_policy_list_response import (
    InsurancePolicyListResponse,
)
from app.schemas.insurance.insurance_policy_response import InsurancePolicyResponse
from app.schemas.insurance.insurance_policy_update_request import (
    InsurancePolicyUpdateRequest,
)
from app.services.insurance import insurance_policy_service

router = APIRouter(prefix="/insurance-policies", tags=["insurance-policies"])


@router.post("", response_model=InsurancePolicyResponse, status_code=201)
async def create_policy(
    payload: InsurancePolicyCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> InsurancePolicyResponse:
    return await insurance_policy_service.create_policy(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        listing_id=payload.listing_id,
        policy_name=payload.policy_name,
        carrier=payload.carrier,
        policy_number=payload.policy_number,
        effective_date=payload.effective_date,
        expiration_date=payload.expiration_date,
        coverage_amount_cents=payload.coverage_amount_cents,
        notes=payload.notes,
    )


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
