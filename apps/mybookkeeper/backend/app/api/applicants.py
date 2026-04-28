"""HTTP routes for the Applicants domain — read-only (PR 3.1b).

Write operations (promotion from inquiry, screening kicks, video call notes)
ship in subsequent PRs (3.2 / 3.3 / 3.4). PII is encrypted at rest by the
SQLAlchemy ``EncryptedString`` type decorator on the model — routes interact
with plaintext only.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.schemas.applicants.applicant_list_response import ApplicantListResponse
from app.services.applicants import applicant_service

router = APIRouter(prefix="/applicants", tags=["applicants"])


@router.get("", response_model=ApplicantListResponse)
async def list_applicants(
    stage: str | None = Query(None, description="Optional stage filter"),
    include_deleted: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> ApplicantListResponse:
    return await applicant_service.list_applicants(
        ctx.organization_id,
        ctx.user_id,
        stage=stage,
        include_deleted=include_deleted,
        limit=limit,
        offset=offset,
    )


@router.get("/{applicant_id}", response_model=ApplicantDetailResponse)
async def get_applicant(
    applicant_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> ApplicantDetailResponse:
    try:
        return await applicant_service.get_applicant(
            ctx.organization_id, ctx.user_id, applicant_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Applicant not found") from exc
