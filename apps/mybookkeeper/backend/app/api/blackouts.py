"""Blackout notes + file-attachment endpoints.

Routes live under ``/listings/blackouts/{blackout_id}`` and share the
``/listings`` prefix router so the Vite dev proxy and Caddy both forward them
under ``/api/listings/``.

All endpoints require org-member auth and are tenant-scoped:
- PATCH updates host_notes only; the iCal poller never touches this field.
- POST /attachments: multipart single-file upload (content-sniffed, EXIF-stripped).
- GET /attachments: returns list with presigned URLs.
- DELETE /attachments/{id}: DB delete + best-effort MinIO cleanup.
"""
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.listings.blackout_response import BlackoutResponse
from app.schemas.listings.blackout_update_request import BlackoutUpdateRequest
from app.schemas.listings.listing_blackout_attachment_response import (
    ListingBlackoutAttachmentResponse,
)
from app.services.listings import blackout_service

router = APIRouter(prefix="/listings/blackouts", tags=["blackouts"])


@router.patch("/{blackout_id}", response_model=BlackoutResponse)
async def update_blackout(
    blackout_id: uuid.UUID,
    payload: BlackoutUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> BlackoutResponse:
    """Update editable host fields on a blackout (notes only for now).

    Returns 404 for cross-tenant access — same response shape as a missing
    row so callers cannot enumerate blackout IDs across organizations.
    """
    try:
        return await blackout_service.update_notes(
            ctx.organization_id,
            blackout_id,
            payload.host_notes,
        )
    except blackout_service.BlackoutNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Blackout not found") from exc


@router.post(
    "/{blackout_id}/attachments",
    response_model=ListingBlackoutAttachmentResponse,
    status_code=201,
)
async def upload_attachment(
    blackout_id: uuid.UUID,
    file: UploadFile = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> ListingBlackoutAttachmentResponse:
    """Upload a single file attachment to a blackout.

    - Content-type is sniffed from header bytes, not the filename extension.
    - Allowlist: images (PNG/JPEG/WebP/GIF), PDF, plain text.
    - 25MB size cap (configurable via MAX_BLACKOUT_ATTACHMENT_SIZE_BYTES).
    - JPEG/PNG/WebP images have EXIF metadata stripped before storage.
    """
    content = await file.read()
    try:
        return await blackout_service.upload_attachment(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            blackout_id=blackout_id,
            content=content,
            filename=file.filename or "",
            declared_content_type=file.content_type,
        )
    except blackout_service.BlackoutNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Blackout not found") from exc
    except blackout_service.AttachmentTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except blackout_service.AttachmentTypeRejectedError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except blackout_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/{blackout_id}/attachments",
    response_model=list[ListingBlackoutAttachmentResponse],
)
async def list_attachments(
    blackout_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> list[ListingBlackoutAttachmentResponse]:
    """Return all attachments for a blackout (with presigned URLs)."""
    try:
        return await blackout_service.list_attachments(
            ctx.organization_id,
            blackout_id,
        )
    except blackout_service.BlackoutNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Blackout not found") from exc


@router.delete(
    "/{blackout_id}/attachments/{attachment_id}",
    status_code=204,
)
async def delete_attachment(
    blackout_id: uuid.UUID,
    attachment_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    """Delete a single attachment (DB + best-effort MinIO cleanup)."""
    try:
        await blackout_service.delete_attachment(
            ctx.organization_id,
            blackout_id,
            attachment_id,
        )
    except (blackout_service.BlackoutNotFoundError, blackout_service.AttachmentNotFoundError) as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    return Response(status_code=204)
