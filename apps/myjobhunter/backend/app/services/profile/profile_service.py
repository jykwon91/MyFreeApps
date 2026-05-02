"""Profile service — orchestrates all profile sub-domains.

Per the layered-architecture rule:
  Routes → Services → Repositories; never import ORM/DB in route handlers.

Tenant isolation: every public function takes ``user_id`` and forwards it
to the repo. The repo also filters by ``user_id`` — defense in depth.

Profile is 1:1 with users. ``get_or_create_profile`` is called on every
profile read so the row is lazily created the first time a user visits the
Profile page — no explicit "create profile" endpoint needed.

Screening answers: ``is_eeoc`` is ALWAYS derived from ``question_key`` at
write time via ``app.core.screening_questions.is_eeoc``. Callers cannot
set or override it. Attempting to set ``is_eeoc`` via the request body
is rejected by ``extra='forbid'`` at the schema layer.
"""
from __future__ import annotations

import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.screening_questions import ALLOWED_KEYS, is_eeoc as _is_eeoc
from app.models.profile.education import Education
from app.models.profile.profile import Profile
from app.models.profile.screening_answer import ScreeningAnswer
from app.models.profile.skill import Skill
from app.models.profile.work_history import WorkHistory
from app.repositories.profile import (
    education_repository,
    profile_repository,
    screening_answer_repository,
    skill_repository,
    work_history_repository,
)
from app.schemas.profile.education_create_request import EducationCreateRequest
from app.schemas.profile.education_update_request import EducationUpdateRequest
from app.schemas.profile.profile_update_request import ProfileUpdateRequest
from app.schemas.profile.screening_answer_create_request import ScreeningAnswerCreateRequest
from app.schemas.profile.screening_answer_update_request import ScreeningAnswerUpdateRequest
from app.schemas.profile.skill_create_request import SkillCreateRequest
from app.schemas.profile.work_history_create_request import WorkHistoryCreateRequest
from app.schemas.profile.work_history_update_request import WorkHistoryUpdateRequest


# ---------------------------------------------------------------------------
# Domain-level errors
# ---------------------------------------------------------------------------


class DuplicateSkillError(ValueError):
    """Raised when a skill with the same name (case-insensitive) already exists.

    Subclasses ``ValueError`` so the route maps it to HTTP 409.
    """


class DuplicateScreeningAnswerError(ValueError):
    """Raised when a screening answer for the same question_key already exists.

    Subclasses ``ValueError`` so the route maps it to HTTP 409.
    """


class InvalidScreeningKeyError(ValueError):
    """Raised when question_key is not in ALLOWED_KEYS.

    Subclasses ``ValueError`` so the route maps it to HTTP 422.
    """


# ---------------------------------------------------------------------------
# Profile CRUD
# ---------------------------------------------------------------------------


async def get_profile(db: AsyncSession, user_id: uuid.UUID) -> Profile | None:
    return await profile_repository.get_by_user_id(db, user_id)


async def get_or_create_profile(db: AsyncSession, user_id: uuid.UUID) -> Profile:
    """Return the user's Profile, creating it lazily on first access."""
    profile = await profile_repository.get_by_user_id(db, user_id)
    if profile is None:
        profile = Profile(user_id=user_id)
        profile = await profile_repository.create(db, profile)
        await db.commit()
    return profile


async def update_profile(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: ProfileUpdateRequest,
) -> Profile:
    """Apply a partial update to the user's profile.

    Lazily creates the profile row if it doesn't exist yet.
    Commits at the end so the write survives the request lifecycle.
    """
    profile = await get_or_create_profile(db, user_id)
    updates = request.to_update_dict()
    if updates:
        profile = await profile_repository.update(db, profile, updates)
        await db.commit()
    return profile


# ---------------------------------------------------------------------------
# Work history CRUD
# ---------------------------------------------------------------------------


async def list_work_history(db: AsyncSession, user_id: uuid.UUID) -> list[WorkHistory]:
    return await work_history_repository.list_by_user(db, user_id)


async def get_work_history(
    db: AsyncSession, user_id: uuid.UUID, work_history_id: uuid.UUID,
) -> WorkHistory | None:
    return await work_history_repository.get_by_id(db, work_history_id, user_id)


async def create_work_history(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: WorkHistoryCreateRequest,
) -> WorkHistory:
    profile = await get_or_create_profile(db, user_id)
    entry = WorkHistory(
        user_id=user_id,
        profile_id=profile.id,
        company_name=request.company_name,
        title=request.title,
        start_date=request.start_date,
        end_date=request.end_date,
        bullets=request.bullets,
    )
    entry = await work_history_repository.create(db, entry)
    await db.commit()
    return entry


async def update_work_history(
    db: AsyncSession,
    user_id: uuid.UUID,
    work_history_id: uuid.UUID,
    request: WorkHistoryUpdateRequest,
) -> WorkHistory | None:
    entry = await work_history_repository.get_by_id(db, work_history_id, user_id)
    if entry is None:
        return None
    updates = request.to_update_dict()
    if updates:
        entry = await work_history_repository.update(db, entry, updates)
        await db.commit()
    return entry


async def delete_work_history(
    db: AsyncSession,
    user_id: uuid.UUID,
    work_history_id: uuid.UUID,
) -> bool:
    entry = await work_history_repository.get_by_id(db, work_history_id, user_id)
    if entry is None:
        return False
    await work_history_repository.delete(db, entry)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Education CRUD
# ---------------------------------------------------------------------------


async def list_education(db: AsyncSession, user_id: uuid.UUID) -> list[Education]:
    return await education_repository.list_by_user(db, user_id)


async def get_education(
    db: AsyncSession, user_id: uuid.UUID, education_id: uuid.UUID,
) -> Education | None:
    return await education_repository.get_by_id(db, education_id, user_id)


async def create_education(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: EducationCreateRequest,
) -> Education:
    profile = await get_or_create_profile(db, user_id)
    entry = Education(
        user_id=user_id,
        profile_id=profile.id,
        school=request.school,
        degree=request.degree,
        field=request.field,
        start_year=request.start_year,
        end_year=request.end_year,
        gpa=request.gpa,
    )
    entry = await education_repository.create(db, entry)
    await db.commit()
    return entry


async def update_education(
    db: AsyncSession,
    user_id: uuid.UUID,
    education_id: uuid.UUID,
    request: EducationUpdateRequest,
) -> Education | None:
    entry = await education_repository.get_by_id(db, education_id, user_id)
    if entry is None:
        return None
    updates = request.to_update_dict()
    if updates:
        entry = await education_repository.update(db, entry, updates)
        await db.commit()
    return entry


async def delete_education(
    db: AsyncSession,
    user_id: uuid.UUID,
    education_id: uuid.UUID,
) -> bool:
    entry = await education_repository.get_by_id(db, education_id, user_id)
    if entry is None:
        return False
    await education_repository.delete(db, entry)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Skills CRUD
# ---------------------------------------------------------------------------


async def list_skills(db: AsyncSession, user_id: uuid.UUID) -> list[Skill]:
    return await skill_repository.list_by_user(db, user_id)


async def create_skill(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: SkillCreateRequest,
) -> Skill:
    profile = await get_or_create_profile(db, user_id)
    skill = Skill(
        user_id=user_id,
        profile_id=profile.id,
        name=request.name,
        years_experience=request.years_experience,
        category=request.category,
    )
    try:
        skill = await skill_repository.create(db, skill)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise DuplicateSkillError(
            f"A skill named {request.name!r} already exists (case-insensitive).",
        ) from exc
    return skill


async def delete_skill(
    db: AsyncSession,
    user_id: uuid.UUID,
    skill_id: uuid.UUID,
) -> bool:
    skill = await skill_repository.get_by_id(db, skill_id, user_id)
    if skill is None:
        return False
    await skill_repository.delete(db, skill)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Screening answers CRUD
# ---------------------------------------------------------------------------


async def list_screening_answers(
    db: AsyncSession, user_id: uuid.UUID,
) -> list[ScreeningAnswer]:
    return await screening_answer_repository.list_by_user(db, user_id)


async def get_screening_answer(
    db: AsyncSession, user_id: uuid.UUID, answer_id: uuid.UUID,
) -> ScreeningAnswer | None:
    return await screening_answer_repository.get_by_id(db, answer_id, user_id)


async def create_screening_answer(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: ScreeningAnswerCreateRequest,
) -> ScreeningAnswer:
    if request.question_key not in ALLOWED_KEYS:
        raise InvalidScreeningKeyError(
            f"question_key {request.question_key!r} is not allowed. "
            f"Must be one of the keys defined in screening_questions.ALLOWED_KEYS.",
        )
    profile = await get_or_create_profile(db, user_id)
    # Derive is_eeoc from question_key — callers cannot override this.
    answer = ScreeningAnswer(
        user_id=user_id,
        profile_id=profile.id,
        question_key=request.question_key,
        answer=request.answer,
        is_eeoc=_is_eeoc(request.question_key),
    )
    try:
        answer = await screening_answer_repository.create(db, answer)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise DuplicateScreeningAnswerError(
            f"An answer for question_key={request.question_key!r} already exists. "
            "Use PATCH to update it.",
        ) from exc
    return answer


async def update_screening_answer(
    db: AsyncSession,
    user_id: uuid.UUID,
    answer_id: uuid.UUID,
    request: ScreeningAnswerUpdateRequest,
) -> ScreeningAnswer | None:
    answer = await screening_answer_repository.get_by_id(db, answer_id, user_id)
    if answer is None:
        return None
    updates = request.to_update_dict()
    if updates:
        answer = await screening_answer_repository.update(db, answer, updates)
        await db.commit()
    return answer


async def delete_screening_answer(
    db: AsyncSession,
    user_id: uuid.UUID,
    answer_id: uuid.UUID,
) -> bool:
    answer = await screening_answer_repository.get_by_id(db, answer_id, user_id)
    if answer is None:
        return False
    await screening_answer_repository.delete(db, answer)
    await db.commit()
    return True
