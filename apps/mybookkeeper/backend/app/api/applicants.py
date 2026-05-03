"""HTTP routes for the Applicants domain.

PR 3.1b shipped read-only list / detail.
PR 3.2 adds POST /applicants/promote/{inquiry_id} — atomic promotion from
an Inquiry. Screening (PR 3.3) and video-call notes (PR 3.4) follow.

PII is encrypted at rest by the SQLAlchemy ``EncryptedString`` type
decorator on the model — routes interact with plaintext only.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.schemas.applicants.applicant_list_response import ApplicantListResponse
from app.schemas.applicants.applicant_promote_request import ApplicantPromoteRequest
from app.schemas.applicants.stage_transition_request import StageTransitionRequest
from app.services.applicants import applicant_service, applicant_stage_service, promote_service

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


@router.patch(
    "/{applicant_id}/stage",
    response_model=ApplicantDetailResponse,
)
async def transition_stage(
    applicant_id: uuid.UUID,
    payload: StageTransitionRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> ApplicantDetailResponse:
    """Manually transition an applicant to a new stage.

    The host can approve, decline, or reset an applicant without uploading
    a screening report. An ``applicant_events`` row with ``event_type =
    "stage_changed"`` is appended atomically alongside the stage update.

    Errors:
        404 — applicant not found in the calling tenant.
        422 — new_stage is not a known stage, transition is not allowed from
              the current stage, or note exceeds 500 characters.
    """
    try:
        return await applicant_stage_service.transition_stage(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=applicant_id,
            new_stage=payload.new_stage,
            note=payload.note,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Applicant not found") from exc
    except (
        applicant_stage_service.InvalidStageError,
        applicant_stage_service.InvalidTransitionError,
    ) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/promote/{inquiry_id}",
    response_model=ApplicantDetailResponse,
    status_code=200,
)
async def promote_inquiry(
    inquiry_id: uuid.UUID,
    payload: ApplicantPromoteRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> ApplicantDetailResponse:
    """Atomically promote an Inquiry into an Applicant.

    Returns the full ``ApplicantDetailResponse`` for the new applicant.

    Errors:
        404 — inquiry not found in the calling tenant.
        409 — applicant already exists for this inquiry. Body includes
              ``applicant_id`` so the frontend can navigate to it.
        409 — inquiry stage is terminal (``declined`` / ``archived``).
    """
    try:
        applicant = await promote_service.promote_from_inquiry(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            inquiry_id=inquiry_id,
            overrides=payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Inquiry not found") from exc
    except promote_service.AlreadyPromotedError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "already_promoted",
                "message": "This inquiry has already been promoted.",
                "applicant_id": str(exc.applicant_id),
            },
        ) from exc
    except promote_service.InquiryNotPromotableError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "not_promotable",
                "message": str(exc),
                "stage": exc.stage,
            },
        ) from exc

    # Re-load through the read service so the response shape is identical
    # to GET /applicants/{id} — same Pydantic schema, same children.
    return await applicant_service.get_applicant(
        ctx.organization_id, ctx.user_id, applicant.id,
    )
