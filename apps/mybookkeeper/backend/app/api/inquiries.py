"""HTTP routes for the Inquiries domain — manual create / update / delete /
inbox / detail.

Email-parser ingestion lands in PR 2.2; this PR ships the host-driven flows
only. PII is encrypted at rest by the SQLAlchemy ``EncryptedString`` type
decorator on the model — routes interact with plaintext.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.inquiries.inquiry_create_request import InquiryCreateRequest
from app.schemas.inquiries.inquiry_list_response import InquiryListResponse
from app.schemas.inquiries.inquiry_message_response import InquiryMessageResponse
from app.schemas.inquiries.inquiry_reply_request import InquiryReplyRequest
from app.schemas.inquiries.inquiry_response import InquiryResponse
from app.schemas.inquiries.inquiry_update_request import InquiryUpdateRequest
from app.schemas.inquiries.rendered_template_response import RenderedTemplateResponse
from app.services.inquiries import (
    inquiry_reply_service,
    inquiry_service,
    reply_template_service,
)

router = APIRouter(prefix="/inquiries", tags=["inquiries"])


@router.get("", response_model=InquiryListResponse)
async def list_inbox(
    stage: str | None = Query(None, description="Optional stage filter"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> InquiryListResponse:
    return await inquiry_service.list_inbox(
        ctx.organization_id, ctx.user_id, stage=stage, limit=limit, offset=offset,
    )


@router.post("", response_model=InquiryResponse, status_code=201)
async def create_inquiry(
    payload: InquiryCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> InquiryResponse:
    try:
        return await inquiry_service.create_inquiry(
            ctx.organization_id, ctx.user_id, payload,
        )
    except inquiry_service.InquiryConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{inquiry_id}", response_model=InquiryResponse)
async def get_inquiry(
    inquiry_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> InquiryResponse:
    try:
        return await inquiry_service.get_inquiry(
            ctx.organization_id, ctx.user_id, inquiry_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Inquiry not found") from exc


@router.patch("/{inquiry_id}", response_model=InquiryResponse)
async def update_inquiry(
    inquiry_id: uuid.UUID,
    payload: InquiryUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> InquiryResponse:
    try:
        return await inquiry_service.update_inquiry(
            ctx.organization_id, ctx.user_id, inquiry_id, payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Inquiry not found") from exc


@router.delete("/{inquiry_id}", status_code=204)
async def delete_inquiry(
    inquiry_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await inquiry_service.delete_inquiry(
            ctx.organization_id, ctx.user_id, inquiry_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Inquiry not found") from exc
    return Response(status_code=204)


@router.get(
    "/{inquiry_id}/render-template/{template_id}",
    response_model=RenderedTemplateResponse,
)
async def render_template(
    inquiry_id: uuid.UUID,
    template_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> RenderedTemplateResponse:
    """Preview-rendered subject + body for a reply-template applied to an inquiry.

    Read-only. Does NOT send anything. Calling code uses this to populate the
    composer; the host edits before clicking Send so the final text comes in
    with POST /inquiries/{id}/reply.
    """
    try:
        return await reply_template_service.render_for_inquiry(
            ctx.organization_id, ctx.user_id, inquiry_id, template_id,
        )
    except LookupError as exc:
        raise HTTPException(
            status_code=404, detail="Inquiry or template not found",
        ) from exc


@router.post(
    "/{inquiry_id}/reply",
    response_model=InquiryMessageResponse,
    status_code=201,
)
async def send_reply(
    inquiry_id: uuid.UUID,
    payload: InquiryReplyRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> InquiryMessageResponse:
    """Send a reply to an inquiry via the host's connected Gmail."""
    try:
        return await inquiry_reply_service.send_reply(
            ctx.organization_id, ctx.user_id, inquiry_id, payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Inquiry not found") from exc
    except inquiry_reply_service.InquiryReplyMissingIntegrationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except inquiry_reply_service.InquiryReplyMissingSendScopeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except inquiry_reply_service.InquiryReplyMissingRecipientError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except inquiry_reply_service.InquiryReplySendFailedError as exc:
        # 502 — upstream Gmail rejected; the host can retry.
        raise HTTPException(status_code=502, detail=str(exc)) from exc
