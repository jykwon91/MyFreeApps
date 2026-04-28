"""Applicants service — read-only orchestration for PR 3.1b.

Per the layered-architecture rule: services orchestrate (load → decide →
shape), repositories own queries. Tenant isolation is via
``(organization_id, user_id)`` per RENTALS_PLAN.md §8.1.

Write operations (promote / screening / video calls) live in dedicated
services that ship in PR 3.2 / 3.3 / 3.4.
"""
from __future__ import annotations

import uuid

from app.db.session import AsyncSessionLocal
from app.repositories.applicants import (
    applicant_event_repo,
    applicant_repo,
    reference_repo,
    screening_result_repo,
    video_call_note_repo,
)
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.schemas.applicants.applicant_event_response import ApplicantEventResponse
from app.schemas.applicants.applicant_list_response import ApplicantListResponse
from app.schemas.applicants.applicant_summary import ApplicantSummary
from app.schemas.applicants.reference_response import ReferenceResponse
from app.schemas.applicants.screening_result_response import ScreeningResultResponse
from app.schemas.applicants.video_call_note_response import VideoCallNoteResponse


def _to_summary(applicant) -> ApplicantSummary:
    return ApplicantSummary.model_validate(applicant)


def _to_detail(
    applicant,
    *,
    screening_results,
    references,
    video_call_notes,
    events,
) -> ApplicantDetailResponse:
    base = ApplicantDetailResponse.model_validate(applicant)
    return base.model_copy(update={
        "screening_results": [
            ScreeningResultResponse.model_validate(s) for s in screening_results
        ],
        "references": [ReferenceResponse.model_validate(r) for r in references],
        "video_call_notes": [
            VideoCallNoteResponse.model_validate(n) for n in video_call_notes
        ],
        "events": [ApplicantEventResponse.model_validate(e) for e in events],
    })


async def list_applicants(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    stage: str | None = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> ApplicantListResponse:
    """List applicants for a tenant. Newest first. Paginated."""
    async with AsyncSessionLocal() as db:
        rows = await applicant_repo.list_for_user(
            db,
            organization_id=organization_id,
            user_id=user_id,
            stage=stage,
            include_deleted=include_deleted,
            limit=limit,
            offset=offset,
        )
        total = await applicant_repo.count_for_user(
            db,
            organization_id=organization_id,
            user_id=user_id,
            stage=stage,
            include_deleted=include_deleted,
        )
    items = [_to_summary(row) for row in rows]
    has_more = (offset + len(items)) < total
    return ApplicantListResponse(items=items, total=total, has_more=has_more)


async def get_applicant(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
) -> ApplicantDetailResponse:
    """Return the applicant + nested children. Raises ``LookupError`` if not found."""
    async with AsyncSessionLocal() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise LookupError(f"Applicant {applicant_id} not found")
        screening_results = await screening_result_repo.list_for_applicant(
            db,
            applicant_id=applicant.id,
            organization_id=organization_id,
            user_id=user_id,
        )
        references = await reference_repo.list_for_applicant(
            db,
            applicant_id=applicant.id,
            organization_id=organization_id,
            user_id=user_id,
        )
        video_call_notes = await video_call_note_repo.list_for_applicant(
            db,
            applicant_id=applicant.id,
            organization_id=organization_id,
            user_id=user_id,
        )
        events = await applicant_event_repo.list_for_applicant(
            db,
            applicant_id=applicant.id,
            organization_id=organization_id,
            user_id=user_id,
        )
    return _to_detail(
        applicant,
        screening_results=screening_results,
        references=references,
        video_call_notes=video_call_notes,
        events=events,
    )
