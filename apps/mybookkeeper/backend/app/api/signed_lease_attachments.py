"""HTTP routes for the files attached to a signed lease."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)
from app.schemas.leases.signed_lease_attachment_signing_state_request import (
    SignedLeaseAttachmentSigningStateRequest,
)
from app.schemas.leases.signed_lease_attachment_update_request import (
    SignedLeaseAttachmentUpdateRequest,
)
from app.services.leases import signed_lease_service

router = APIRouter(prefix="/signed-leases", tags=["signed-leases"])


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


@router.patch(
    "/{lease_id}/attachments/{attachment_id}/signing-state",
    response_model=SignedLeaseAttachmentResponse,
)
async def update_attachment_signing_state(
    lease_id: uuid.UUID,
    attachment_id: uuid.UUID,
    payload: SignedLeaseAttachmentSigningStateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> SignedLeaseAttachmentResponse:
    # Only forward the keys the caller explicitly sent so omitted keys
    # leave the existing column untouched (sentinel-based partial PATCH).
    signing_fields = {
        key: getattr(payload, key)
        for key in payload.model_fields_set
        if key in {"signed_by_tenant_at", "signed_by_landlord_at"}
    }
    try:
        return await signed_lease_service.update_attachment_signing_state(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            lease_id=lease_id,
            attachment_id=attachment_id,
            signing_fields=signing_fields,
        )
    except (
        signed_lease_service.SignedLeaseNotFoundError,
        signed_lease_service.AttachmentNotFoundError,
    ) as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc


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
    except signed_lease_service.AttachmentBacksExtensionError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "ATTACHMENT_BACKS_EXTENSION", "message": str(exc)},
        ) from exc
    return Response(status_code=204)
