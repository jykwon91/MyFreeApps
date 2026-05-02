"""HTTP routes for the Profile domain.

Phase 1 shipped GET /profile returning a stub. Phase 3 (this file) ships:

  Profile:
    GET  /profile          — get or lazily-create the user's profile
    PATCH /profile         — partial update (salary, locations, work auth, etc.)

  Work history:
    GET    /work-history            — list all entries
    POST   /work-history            — create
    GET    /work-history/{id}       — single read
    PATCH  /work-history/{id}       — partial update
    DELETE /work-history/{id}       — hard delete

  Education:
    GET    /education               — list all entries
    POST   /education               — create
    GET    /education/{id}          — single read
    PATCH  /education/{id}          — partial update
    DELETE /education/{id}          — hard delete

  Skills:
    GET    /skills                  — list all
    POST   /skills                  — create (409 on duplicate name)
    DELETE /skills/{id}             — delete

  Screening answers:
    GET    /screening-answers        — list all
    POST   /screening-answers        — create (409 on duplicate key, 422 on unknown key)
    GET    /screening-answers/{id}   — single read
    PATCH  /screening-answers/{id}   — update answer text
    DELETE /screening-answers/{id}   — delete

Auth: every endpoint requires an authenticated user via ``current_active_user``.
Tenant scoping is mandatory — every operation scopes queries by ``user.id``.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.profile.education_create_request import EducationCreateRequest
from app.schemas.profile.education_response import EducationResponse
from app.schemas.profile.education_update_request import EducationUpdateRequest
from app.schemas.profile.profile_response import ProfileResponse
from app.schemas.profile.profile_update_request import ProfileUpdateRequest
from app.schemas.profile.screening_answer_create_request import ScreeningAnswerCreateRequest
from app.schemas.profile.screening_answer_response import ScreeningAnswerResponse
from app.schemas.profile.screening_answer_update_request import ScreeningAnswerUpdateRequest
from app.schemas.profile.skill_create_request import SkillCreateRequest
from app.schemas.profile.skill_response import SkillResponse
from app.schemas.profile.work_history_create_request import WorkHistoryCreateRequest
from app.schemas.profile.work_history_response import WorkHistoryResponse
from app.schemas.profile.work_history_update_request import WorkHistoryUpdateRequest
from app.services.profile import profile_service
from app.services.profile.profile_service import (
    DuplicateScreeningAnswerError,
    DuplicateSkillError,
    InvalidScreeningKeyError,
)

router = APIRouter()

_NOT_FOUND_WORK_HISTORY = "Work history entry not found"
_NOT_FOUND_EDUCATION = "Education entry not found"
_NOT_FOUND_SKILL = "Skill not found"
_NOT_FOUND_SCREENING_ANSWER = "Screening answer not found"


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ProfileResponse:
    """Return the user's profile, lazily creating it on first access."""
    profile = await profile_service.get_or_create_profile(db, user.id)
    return ProfileResponse.model_validate(profile)


@router.patch("/profile", response_model=ProfileResponse)
async def update_profile(
    payload: ProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ProfileResponse:
    """Partially update the user's profile."""
    profile = await profile_service.update_profile(db, user.id, payload)
    return ProfileResponse.model_validate(profile)


# ---------------------------------------------------------------------------
# Work history
# ---------------------------------------------------------------------------


@router.get("/work-history")
async def list_work_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    items = await profile_service.list_work_history(db, user.id)
    return {
        "items": [WorkHistoryResponse.model_validate(e).model_dump(mode="json") for e in items],
        "total": len(items),
    }


@router.post("/work-history", response_model=WorkHistoryResponse, status_code=201)
async def create_work_history(
    payload: WorkHistoryCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> WorkHistoryResponse:
    entry = await profile_service.create_work_history(db, user.id, payload)
    return WorkHistoryResponse.model_validate(entry)


@router.get("/work-history/{work_history_id}", response_model=WorkHistoryResponse)
async def get_work_history(
    work_history_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> WorkHistoryResponse:
    entry = await profile_service.get_work_history(db, user.id, work_history_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_WORK_HISTORY)
    return WorkHistoryResponse.model_validate(entry)


@router.patch("/work-history/{work_history_id}", response_model=WorkHistoryResponse)
async def update_work_history(
    work_history_id: uuid.UUID,
    payload: WorkHistoryUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> WorkHistoryResponse:
    entry = await profile_service.update_work_history(db, user.id, work_history_id, payload)
    if entry is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_WORK_HISTORY)
    return WorkHistoryResponse.model_validate(entry)


@router.delete("/work-history/{work_history_id}", status_code=204)
async def delete_work_history(
    work_history_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    deleted = await profile_service.delete_work_history(db, user.id, work_history_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_WORK_HISTORY)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Education
# ---------------------------------------------------------------------------


@router.get("/education")
async def list_education(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    items = await profile_service.list_education(db, user.id)
    return {
        "items": [EducationResponse.model_validate(e).model_dump(mode="json") for e in items],
        "total": len(items),
    }


@router.post("/education", response_model=EducationResponse, status_code=201)
async def create_education(
    payload: EducationCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> EducationResponse:
    entry = await profile_service.create_education(db, user.id, payload)
    return EducationResponse.model_validate(entry)


@router.get("/education/{education_id}", response_model=EducationResponse)
async def get_education(
    education_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> EducationResponse:
    entry = await profile_service.get_education(db, user.id, education_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_EDUCATION)
    return EducationResponse.model_validate(entry)


@router.patch("/education/{education_id}", response_model=EducationResponse)
async def update_education(
    education_id: uuid.UUID,
    payload: EducationUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> EducationResponse:
    entry = await profile_service.update_education(db, user.id, education_id, payload)
    if entry is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_EDUCATION)
    return EducationResponse.model_validate(entry)


@router.delete("/education/{education_id}", status_code=204)
async def delete_education(
    education_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    deleted = await profile_service.delete_education(db, user.id, education_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_EDUCATION)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------


@router.get("/skills")
async def list_skills(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    items = await profile_service.list_skills(db, user.id)
    return {
        "items": [SkillResponse.model_validate(s).model_dump(mode="json") for s in items],
        "total": len(items),
    }


@router.post("/skills", response_model=SkillResponse, status_code=201)
async def create_skill(
    payload: SkillCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SkillResponse:
    try:
        skill = await profile_service.create_skill(db, user.id, payload)
    except DuplicateSkillError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return SkillResponse.model_validate(skill)


@router.delete("/skills/{skill_id}", status_code=204)
async def delete_skill(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    deleted = await profile_service.delete_skill(db, user.id, skill_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_SKILL)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Screening answers
# ---------------------------------------------------------------------------


@router.get("/screening-answers")
async def list_screening_answers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    items = await profile_service.list_screening_answers(db, user.id)
    return {
        "items": [
            ScreeningAnswerResponse.model_validate(a).model_dump(mode="json") for a in items
        ],
        "total": len(items),
    }


@router.post("/screening-answers", response_model=ScreeningAnswerResponse, status_code=201)
async def create_screening_answer(
    payload: ScreeningAnswerCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ScreeningAnswerResponse:
    try:
        answer = await profile_service.create_screening_answer(db, user.id, payload)
    except InvalidScreeningKeyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DuplicateScreeningAnswerError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return ScreeningAnswerResponse.model_validate(answer)


@router.get("/screening-answers/{answer_id}", response_model=ScreeningAnswerResponse)
async def get_screening_answer(
    answer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ScreeningAnswerResponse:
    answer = await profile_service.get_screening_answer(db, user.id, answer_id)
    if answer is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_SCREENING_ANSWER)
    return ScreeningAnswerResponse.model_validate(answer)


@router.patch("/screening-answers/{answer_id}", response_model=ScreeningAnswerResponse)
async def update_screening_answer(
    answer_id: uuid.UUID,
    payload: ScreeningAnswerUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ScreeningAnswerResponse:
    answer = await profile_service.update_screening_answer(db, user.id, answer_id, payload)
    if answer is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_SCREENING_ANSWER)
    return ScreeningAnswerResponse.model_validate(answer)


@router.delete("/screening-answers/{answer_id}", status_code=204)
async def delete_screening_answer(
    answer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    deleted = await profile_service.delete_screening_answer(db, user.id, answer_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_SCREENING_ANSWER)
    return Response(status_code=204)
