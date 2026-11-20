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

import logging
import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.screening_questions import ALLOWED_KEYS, is_eeoc as _is_eeoc
from app.db.session import AsyncSessionLocal, unit_of_work
from app.db.violated_constraint import violated_constraint_name
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
from app.services.discovery import discovery_embedding_service
from app.services.discovery.discovery_embedding_service import (
    EmbeddingModelLoadError,
)


logger = logging.getLogger(__name__)

SKILL_NAME_UNIQUE_NAME = "uq_skill_user_name"
SCREENING_ANSWER_UNIQUE_NAME = "uq_screening_answer"


# ---------------------------------------------------------------------------
# Discovery-embedding refresh — fields that affect job matching
# ---------------------------------------------------------------------------

# Fields on ProfileUpdateRequest that, when present, affect what
# ``discovery_embedding_service._assemble_profile_text`` produces.
# Keep this in sync with that assembler — if you add a field there,
# add it here too.
_PROFILE_EMBED_FIELDS = frozenset({"summary"})


def _profile_update_affects_embedding(updates: dict) -> bool:
    """True when the patch touches a field that goes into the profile
    embedding. Used to skip the ~100ms ONNX inference on cheap field
    changes (e.g. salary preference, work_auth_status).
    """
    return bool(_PROFILE_EMBED_FIELDS & set(updates))


async def refresh_profile_embedding_best_effort(
    db: AsyncSession, user_id: uuid.UUID,
) -> None:
    """Refresh the embedding; log + swallow ``EmbeddingModelLoadError``
    so the caller's commit still succeeds.

    Call it AFTER committing the profile change. Used by the profile
    writes below and by the resume parser worker once a parse has merged
    rows into the profile.

    This is the ONE place where embedding failures are caught — and
    only because the alternative (failing the user-facing profile save
    or the resume parse because fastembed couldn't load) is worse. The error is captured
    by the logger which Sentry picks up; the boot guard ensures the
    model has already loaded successfully, so reaching this branch in
    production indicates a transient runtime problem worth a Sentry
    page rather than a permanent service degradation.
    """
    try:
        await discovery_embedding_service.refresh_profile_embedding(
            db, user_id,
        )
    except EmbeddingModelLoadError:
        logger.exception(
            "profile embedding refresh failed user=%s — profile change "
            "committed but embedding is stale",
            user_id,
        )


async def _refresh_profile_embedding_after_commit(user_id: uuid.UUID) -> None:
    """Refresh the embedding from the committed profile, in a session of its own.

    The embedding repository commits its own write.
    """
    async with AsyncSessionLocal() as db:
        await refresh_profile_embedding_best_effort(db, user_id)


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


class CurrentRoleEndDateError(ValueError):
    """Raised when a work-history update would leave a row both marked
    current and carrying an end date (violates the DB check constraint).

    Subclasses ``ValueError`` so the route maps it to HTTP 422.
    """


# ---------------------------------------------------------------------------
# Profile CRUD
# ---------------------------------------------------------------------------


async def get_profile(db: AsyncSession, user_id: uuid.UUID) -> Profile | None:
    return await profile_repository.get_by_user_id(db, user_id)


async def _get_or_create_profile_in(db: AsyncSession, user_id: uuid.UUID) -> Profile:
    """The user's Profile within ``db``'s transaction, created (flushed) if missing."""
    profile = await profile_repository.get_by_user_id(db, user_id)
    if profile is None:
        profile = await profile_repository.create(db, Profile(user_id=user_id))
    return profile


async def get_or_create_profile(user_id: uuid.UUID) -> Profile:
    """Return the user's Profile, creating (and committing) it lazily on first access."""
    async with unit_of_work() as db:
        return await _get_or_create_profile_in(db, user_id)


async def update_profile(
    user_id: uuid.UUID,
    request: ProfileUpdateRequest,
) -> Profile:
    """Apply a partial update to the user's profile.

    Lazily creates the profile row if it doesn't exist yet (its own commit),
    then commits the update in a second ``unit_of_work``.
    """
    profile = await get_or_create_profile(user_id)
    updates = request.to_update_dict()
    if updates:
        async with unit_of_work() as db:
            profile = await _get_or_create_profile_in(db, user_id)
            profile = await profile_repository.update(db, profile, updates)
        if _profile_update_affects_embedding(updates):
            await _refresh_profile_embedding_after_commit(user_id)
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
    user_id: uuid.UUID,
    request: WorkHistoryCreateRequest,
) -> WorkHistory:
    profile = await get_or_create_profile(user_id)
    entry = WorkHistory(
        user_id=user_id,
        profile_id=profile.id,
        company_name=request.company_name,
        title=request.title,
        start_date=request.start_date,
        end_date=request.end_date,
        is_current=request.is_current,
        bullets=request.bullets,
    )
    async with unit_of_work() as db:
        entry = await work_history_repository.create(db, entry)
    await _refresh_profile_embedding_after_commit(user_id)
    return entry


async def update_work_history(
    user_id: uuid.UUID,
    work_history_id: uuid.UUID,
    request: WorkHistoryUpdateRequest,
) -> WorkHistory | None:
    updates = request.to_update_dict()
    async with unit_of_work() as db:
        entry = await work_history_repository.get_by_id(db, work_history_id, user_id)
        if entry is None:
            return None
        if not updates:
            return entry
        # Partial update — validate the MERGED row, not just the patch:
        # a patch that flips is_current on while the row still has an end
        # date (or vice versa) must be rejected before it hits the DB
        # check constraint.
        merged_is_current = updates.get("is_current", entry.is_current)
        merged_end_date = updates.get("end_date", entry.end_date)
        if merged_is_current and merged_end_date is not None:
            raise CurrentRoleEndDateError(
                "A current role cannot have an end date. Clear the end date "
                "or unset is_current in the same request."
            )
        entry = await work_history_repository.update(db, entry, updates)
    await _refresh_profile_embedding_after_commit(user_id)
    return entry


async def delete_work_history(
    user_id: uuid.UUID,
    work_history_id: uuid.UUID,
) -> bool:
    async with unit_of_work() as db:
        entry = await work_history_repository.get_by_id(db, work_history_id, user_id)
        if entry is None:
            return False
        await work_history_repository.delete(db, entry)
    await _refresh_profile_embedding_after_commit(user_id)
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
    user_id: uuid.UUID,
    request: EducationCreateRequest,
) -> Education:
    profile = await get_or_create_profile(user_id)
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
    async with unit_of_work() as db:
        return await education_repository.create(db, entry)


async def update_education(
    user_id: uuid.UUID,
    education_id: uuid.UUID,
    request: EducationUpdateRequest,
) -> Education | None:
    updates = request.to_update_dict()
    async with unit_of_work() as db:
        entry = await education_repository.get_by_id(db, education_id, user_id)
        if entry is None or not updates:
            return entry
        return await education_repository.update(db, entry, updates)


async def delete_education(
    user_id: uuid.UUID,
    education_id: uuid.UUID,
) -> bool:
    async with unit_of_work() as db:
        entry = await education_repository.get_by_id(db, education_id, user_id)
        if entry is None:
            return False
        await education_repository.delete(db, entry)
    return True


# ---------------------------------------------------------------------------
# Skills CRUD
# ---------------------------------------------------------------------------


async def list_skills(db: AsyncSession, user_id: uuid.UUID) -> list[Skill]:
    return await skill_repository.list_by_user(db, user_id)


async def create_skill(
    user_id: uuid.UUID,
    request: SkillCreateRequest,
) -> Skill:
    profile = await get_or_create_profile(user_id)
    skill = Skill(
        user_id=user_id,
        profile_id=profile.id,
        name=request.name,
        years_experience=request.years_experience,
        category=request.category,
    )
    try:
        async with unit_of_work() as db:
            skill = await skill_repository.create(db, skill)
    except IntegrityError as exc:
        if violated_constraint_name(exc) != SKILL_NAME_UNIQUE_NAME:
            raise
        raise DuplicateSkillError(
            f"A skill named {request.name!r} already exists (case-insensitive).",
        ) from exc
    await _refresh_profile_embedding_after_commit(user_id)
    return skill


async def delete_skill(
    user_id: uuid.UUID,
    skill_id: uuid.UUID,
) -> bool:
    async with unit_of_work() as db:
        skill = await skill_repository.get_by_id(db, skill_id, user_id)
        if skill is None:
            return False
        await skill_repository.delete(db, skill)
    await _refresh_profile_embedding_after_commit(user_id)
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
    user_id: uuid.UUID,
    request: ScreeningAnswerCreateRequest,
) -> ScreeningAnswer:
    if request.question_key not in ALLOWED_KEYS:
        raise InvalidScreeningKeyError(
            f"question_key {request.question_key!r} is not allowed. "
            f"Must be one of the keys defined in screening_questions.ALLOWED_KEYS.",
        )
    profile = await get_or_create_profile(user_id)
    # Derive is_eeoc from question_key — callers cannot override this.
    answer = ScreeningAnswer(
        user_id=user_id,
        profile_id=profile.id,
        question_key=request.question_key,
        answer=request.answer,
        is_eeoc=_is_eeoc(request.question_key),
    )
    try:
        async with unit_of_work() as db:
            answer = await screening_answer_repository.create(db, answer)
    except IntegrityError as exc:
        if violated_constraint_name(exc) != SCREENING_ANSWER_UNIQUE_NAME:
            raise
        raise DuplicateScreeningAnswerError(
            f"An answer for question_key={request.question_key!r} already exists. "
            "Use PATCH to update it.",
        ) from exc
    return answer


async def update_screening_answer(
    user_id: uuid.UUID,
    answer_id: uuid.UUID,
    request: ScreeningAnswerUpdateRequest,
) -> ScreeningAnswer | None:
    updates = request.to_update_dict()
    async with unit_of_work() as db:
        answer = await screening_answer_repository.get_by_id(db, answer_id, user_id)
        if answer is None or not updates:
            return answer
        return await screening_answer_repository.update(db, answer, updates)


async def delete_screening_answer(
    user_id: uuid.UUID,
    answer_id: uuid.UUID,
) -> bool:
    async with unit_of_work() as db:
        answer = await screening_answer_repository.get_by_id(db, answer_id, user_id)
        if answer is None:
            return False
        await screening_answer_repository.delete(db, answer)
    return True
