"""Read / upsert the learner's tutor profile (onboarding language + level)."""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.languages import get_language
from app.models.tutor.tutor_profile import TutorProfile
from app.repositories.tutor import tutor_profile_repository
from app.schemas.tutor.profile_schemas import ProfileResponse, ProfileUpdateRequest


class InvalidProfileError(ValueError):
    """Raised when the profile names an unsupported language."""


async def get_profile(db: AsyncSession, user_id: uuid.UUID) -> ProfileResponse | None:
    """The profile, or None when the learner hasn't finished onboarding."""
    profile = await tutor_profile_repository.get(db, user_id)
    return ProfileResponse.model_validate(profile) if profile is not None else None


async def save_profile(
    db: AsyncSession, user_id: uuid.UUID, payload: ProfileUpdateRequest,
) -> ProfileResponse:
    if get_language(payload.language_code) is None:
        raise InvalidProfileError(f"Unsupported language: {payload.language_code}")
    profile = await tutor_profile_repository.get(db, user_id)
    if profile is None:
        profile = await tutor_profile_repository.create(
            db,
            TutorProfile(
                user_id=user_id,
                language_code=payload.language_code,
                level=payload.level.value,
            ),
        )
    else:
        profile.language_code = payload.language_code
        profile.level = payload.level.value
        await db.flush()
        await db.refresh(profile)
    response = ProfileResponse.model_validate(profile)
    await db.commit()
    return response
