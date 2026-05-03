"""HTTP routes for lease templates.

Phase 1: upload (multipart), list, detail, update metadata, update placeholder
spec, soft-delete (blocked when active leases reference it), re-upload files
(bumps version and preserves host placeholder edits).

Tenant isolation is via ``ctx.user_id`` AND ``ctx.organization_id`` on every
call — cross-tenant access returns the same shape as a missing row.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.leases.generate_defaults_response import GenerateDefaultsResponse
from app.schemas.leases.lease_template_list_response import (
    LeaseTemplateListResponse,
)
from app.schemas.leases.lease_template_placeholder_response import (
    LeaseTemplatePlaceholderResponse,
)
from app.schemas.leases.lease_template_placeholder_update_request import (
    LeaseTemplatePlaceholderUpdateRequest,
)
from app.schemas.leases.lease_template_response import LeaseTemplateResponse
from app.schemas.leases.lease_template_update_request import (
    LeaseTemplateUpdateRequest,
)
from app.services.leases import lease_template_service

router = APIRouter(prefix="/lease-templates", tags=["lease-templates"])


@router.post("", response_model=LeaseTemplateResponse, status_code=201)
async def create_template(
    name: str = Form(...),
    description: str | None = Form(None),
    files: list[UploadFile] = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> LeaseTemplateResponse:
    payload: list[tuple[str, bytes, str | None]] = []
    for f in files:
        content = await f.read()
        payload.append((f.filename or "", content, f.content_type))
    try:
        return await lease_template_service.upload_template(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            name=name,
            description=description,
            files=payload,
        )
    except lease_template_service.TemplateFileTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except lease_template_service.TemplateFileTypeRejectedError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except lease_template_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("", response_model=LeaseTemplateListResponse)
async def list_templates(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> LeaseTemplateListResponse:
    return await lease_template_service.list_templates(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        limit=limit,
        offset=offset,
    )


@router.get("/{template_id}", response_model=LeaseTemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> LeaseTemplateResponse:
    try:
        return await lease_template_service.get_template(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            template_id=template_id,
        )
    except lease_template_service.TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Template not found") from exc


@router.patch("/{template_id}", response_model=LeaseTemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    payload: LeaseTemplateUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> LeaseTemplateResponse:
    try:
        return await lease_template_service.update_template_metadata(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            template_id=template_id,
            name=payload.name,
            description=payload.description,
        )
    except lease_template_service.TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Template not found") from exc


@router.patch(
    "/{template_id}/placeholders/{placeholder_id}",
    response_model=LeaseTemplatePlaceholderResponse,
)
async def update_placeholder(
    template_id: uuid.UUID,
    placeholder_id: uuid.UUID,
    payload: LeaseTemplatePlaceholderUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> LeaseTemplatePlaceholderResponse:
    fields = payload.model_dump(exclude_unset=True)
    try:
        return await lease_template_service.update_placeholder(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            template_id=template_id,
            placeholder_id=placeholder_id,
            fields=fields,
        )
    except lease_template_service.TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Template not found") from exc
    except lease_template_service.PlaceholderNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Placeholder not found") from exc
    except lease_template_service.InvalidComputedExprError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except lease_template_service.InvalidDefaultSourceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get(
    "/{template_id}/generate-defaults",
    response_model=GenerateDefaultsResponse,
)
async def get_generate_defaults(
    template_id: uuid.UUID,
    applicant_id: uuid.UUID = Query(...),
    ctx: RequestContext = Depends(current_org_member),
) -> GenerateDefaultsResponse:
    """Return resolved default values for each placeholder given an applicant.

    Evaluates each placeholder's ``default_source`` spec against the applicant
    and (if linked) the applicant's inquiry. Returns the resolved value and
    provenance so the frontend can pre-fill the generate form and show
    provenance badges.
    """
    try:
        defaults = await lease_template_service.generate_defaults(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            template_id=template_id,
            applicant_id=applicant_id,
        )
        from app.schemas.leases.generate_defaults_response import PlaceholderDefault
        return GenerateDefaultsResponse(
            defaults=[PlaceholderDefault(**d) for d in defaults]
        )
    except lease_template_service.TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Template not found") from exc
    except lease_template_service.ApplicantNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Applicant not found") from exc


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await lease_template_service.soft_delete_template(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            template_id=template_id,
        )
    except lease_template_service.TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Template not found") from exc
    except lease_template_service.TemplateInUseError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "template_in_use",
                "message": str(exc),
            },
        ) from exc
    return Response(status_code=204)


@router.post(
    "/{template_id}/files",
    response_model=LeaseTemplateResponse,
)
async def replace_files(
    template_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> LeaseTemplateResponse:
    payload: list[tuple[str, bytes, str | None]] = []
    for f in files:
        content = await f.read()
        payload.append((f.filename or "", content, f.content_type))
    try:
        return await lease_template_service.replace_template_files(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            template_id=template_id,
            files=payload,
        )
    except lease_template_service.TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Template not found") from exc
    except lease_template_service.TemplateFileTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except lease_template_service.TemplateFileTypeRejectedError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except lease_template_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
