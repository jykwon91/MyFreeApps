"""HTTP routes for signed leases.

The route prefix is ``/signed-leases`` (not ``/leases``) because the route
tree already has ``/tenants/leases`` for the unrelated financial-record
``leases`` table. Frontend exposes ``/leases`` to the user — that's a
client-side route.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)
from app.schemas.leases.signed_lease_attachment_update_request import (
    SignedLeaseAttachmentUpdateRequest,
)
from app.schemas.leases.signed_lease_create_request import (
    SignedLeaseCreateRequest,
)
from app.schemas.leases.signed_lease_list_response import (
    SignedLeaseListResponse,
)
from app.schemas.leases.signed_lease_response import SignedLeaseResponse
from app.schemas.leases.signed_lease_update_request import (
    SignedLeaseUpdateRequest,
)
from app.services.leases import lease_template_service, signed_lease_service
from app.core.lease_enums import SIGNED_LEASE_STATUSES

router = APIRouter(prefix="/signed-leases", tags=["signed-leases"])


@router.post("", response_model=SignedLeaseResponse, status_code=201)
async def create_lease(
    payload: SignedLeaseCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> SignedLeaseResponse:
    try:
        return await signed_lease_service.create_lease(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            template_id=payload.template_id,
            applicant_id=payload.applicant_id,
            listing_id=payload.listing_id,
            values=payload.values,
        )
    except lease_template_service.TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Template not found") from exc
    except signed_lease_service.MissingRequiredValuesError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/import", response_model=SignedLeaseResponse, status_code=201)
async def import_lease(
    applicant_id: uuid.UUID = Form(...),
    listing_id: uuid.UUID | None = Form(None),
    starts_on: _dt.date | None = Form(None),
    ends_on: _dt.date | None = Form(None),
    notes: str | None = Form(None),
    status: str = Form("signed"),
    files: list[UploadFile] = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> SignedLeaseResponse:
    if not files:
        raise HTTPException(status_code=422, detail="At least one file is required")
    if status not in SIGNED_LEASE_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {status}")
    if notes is not None and len(notes) > 2000:
        raise HTTPException(status_code=422, detail="Notes must be 2000 characters or fewer")

    file_tuples: list[tuple[bytes, str, str | None]] = []
    for f in files:
        content = await f.read()
        file_tuples.append((content, f.filename or "", f.content_type))

    try:
        return await signed_lease_service.import_signed_lease(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            applicant_id=applicant_id,
            listing_id=listing_id,
            starts_on=starts_on,
            ends_on=ends_on,
            notes=notes,
            status=status,
            files=file_tuples,
        )
    except signed_lease_service.ApplicantNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Applicant not found") from exc
    except signed_lease_service.ListingNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Listing not found") from exc
    except signed_lease_service.AttachmentTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except signed_lease_service.AttachmentTypeRejectedError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except signed_lease_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("", response_model=SignedLeaseListResponse)
async def list_leases(
    applicant_id: uuid.UUID | None = Query(None),
    listing_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    starts_after: _dt.date | None = Query(None),
    starts_before: _dt.date | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> SignedLeaseListResponse:
    return await signed_lease_service.list_leases(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        applicant_id=applicant_id,
        listing_id=listing_id,
        status=status,
        starts_after=starts_after,
        starts_before=starts_before,
        limit=limit,
        offset=offset,
    )


@router.get("/{lease_id}", response_model=SignedLeaseResponse)
async def get_lease(
    lease_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> SignedLeaseResponse:
    try:
        return await signed_lease_service.get_lease(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            lease_id=lease_id,
        )
    except signed_lease_service.SignedLeaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Lease not found") from exc


@router.patch("/{lease_id}", response_model=SignedLeaseResponse)
async def update_lease(
    lease_id: uuid.UUID,
    payload: SignedLeaseUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> SignedLeaseResponse:
    try:
        return await signed_lease_service.update_lease(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            lease_id=lease_id,
            notes=payload.notes,
            status=payload.status,
            values=payload.values,
        )
    except signed_lease_service.SignedLeaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Lease not found") from exc
    except signed_lease_service.InvalidStatusTransitionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except signed_lease_service.CannotEditValuesError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/{lease_id}", status_code=204)
async def delete_lease(
    lease_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await signed_lease_service.soft_delete_lease(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            lease_id=lease_id,
        )
    except signed_lease_service.SignedLeaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Lease not found") from exc
    return Response(status_code=204)


@router.post("/{lease_id}/generate", response_model=SignedLeaseResponse)
async def generate_lease(
    lease_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> SignedLeaseResponse:
    try:
        return await signed_lease_service.generate_lease(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            lease_id=lease_id,
        )
    except signed_lease_service.SignedLeaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Lease not found") from exc
    except signed_lease_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post(
    "/{lease_id}/attachments",
    response_model=SignedLeaseAttachmentResponse,
    status_code=201,
)
async def upload_attachment(
    lease_id: uuid.UUID,
    kind: str = Form(...),
    file: UploadFile = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> SignedLeaseAttachmentResponse:
    content = await file.read()
    try:
        return await signed_lease_service.upload_attachment(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            lease_id=lease_id,
            content=content,
            filename=file.filename or "",
            declared_content_type=file.content_type,
            kind=kind,
        )
    except signed_lease_service.SignedLeaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Lease not found") from exc
    except signed_lease_service.AttachmentTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except signed_lease_service.AttachmentTypeRejectedError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except signed_lease_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/{lease_id}/attachments",
    response_model=list[SignedLeaseAttachmentResponse],
)
async def list_attachments(
    lease_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> list[SignedLeaseAttachmentResponse]:
    try:
        return await signed_lease_service.list_attachments(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            lease_id=lease_id,
        )
    except signed_lease_service.SignedLeaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Lease not found") from exc


@router.patch(
    "/{lease_id}/attachments/{attachment_id}",
    response_model=SignedLeaseAttachmentResponse,
)
async def update_attachment(
    lease_id: uuid.UUID,
    attachment_id: uuid.UUID,
    payload: SignedLeaseAttachmentUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> SignedLeaseAttachmentResponse:
    try:
        return await signed_lease_service.update_attachment_kind(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            lease_id=lease_id,
            attachment_id=attachment_id,
            kind=payload.kind,
        )
    except (
        signed_lease_service.SignedLeaseNotFoundError,
        signed_lease_service.AttachmentNotFoundError,
    ) as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    except signed_lease_service.InvalidAttachmentKindError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete(
    "/{lease_id}/attachments/{attachment_id}",
    status_code=204,
)
async def delete_attachment(
    lease_id: uuid.UUID,
    attachment_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await signed_lease_service.delete_attachment(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            lease_id=lease_id,
            attachment_id=attachment_id,
        )
    except (
        signed_lease_service.SignedLeaseNotFoundError,
        signed_lease_service.AttachmentNotFoundError,
    ) as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    return Response(status_code=204)
