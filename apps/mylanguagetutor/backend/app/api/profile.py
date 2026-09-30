"""Learner profile routes (onboarding choices).

    GET /profile    the caller's profile, or JSON ``null`` before onboarding
    PUT /profile    set language + level (upsert)

Auth (active + verified) at the ROUTER level.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.tutor.profile_schemas import ProfileResponse, ProfileUpdateRequest
from app.services.tutor import profile_service
from app.services.tutor.profile_service import InvalidProfileError

router = APIRouter(
    prefix="/profile",
    tags=["profile"],
    dependencies=[Depends(current_active_user)],
)


@router.get("", response_model=ProfileResponse | None)
async def get_profile(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ProfileResponse | None:
    return await profile_service.get_profile(db, user.id)


@router.put("", response_model=ProfileResponse)
async def save_profile(
    payload: ProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ProfileResponse:
    try:
        return await profile_service.save_profile(db, user.id, payload)
    except InvalidProfileError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
