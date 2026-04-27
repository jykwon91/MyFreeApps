"""HTTP routes for reply-template CRUD.

Templates are per-user (not org-shared in PR 2.3 — see RENTALS_PLAN.md §13
OUT OF SCOPE). All endpoints scope by ``ctx.user_id`` so a host can only
see / mutate their own templates.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.inquiries.reply_template_create_request import (
    ReplyTemplateCreateRequest,
)
from app.schemas.inquiries.reply_template_response import ReplyTemplateResponse
from app.schemas.inquiries.reply_template_update_request import (
    ReplyTemplateUpdateRequest,
)
from app.services.inquiries import reply_template_service

router = APIRouter(prefix="/reply-templates", tags=["reply-templates"])


@router.get("", response_model=list[ReplyTemplateResponse])
async def list_templates(
    ctx: RequestContext = Depends(current_org_member),
) -> list[ReplyTemplateResponse]:
    return await reply_template_service.list_templates(
        ctx.organization_id, ctx.user_id,
    )


@router.post("", response_model=ReplyTemplateResponse, status_code=201)
async def create_template(
    payload: ReplyTemplateCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> ReplyTemplateResponse:
    return await reply_template_service.create_template(
        ctx.organization_id, ctx.user_id, payload,
    )


@router.patch("/{template_id}", response_model=ReplyTemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    payload: ReplyTemplateUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> ReplyTemplateResponse:
    try:
        return await reply_template_service.update_template(
            ctx.user_id, template_id, payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Reply template not found") from exc


@router.delete("/{template_id}", status_code=204)
async def archive_template(
    template_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await reply_template_service.archive_template(ctx.user_id, template_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Reply template not found") from exc
    return Response(status_code=204)
