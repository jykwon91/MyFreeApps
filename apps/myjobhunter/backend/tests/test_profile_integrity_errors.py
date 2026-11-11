"""Only the named uniqueness violation maps to a "duplicate" error on profile writes.

``create_skill`` used to turn every ``IntegrityError`` into
``DuplicateSkillError`` (HTTP 409), the same anti-pattern as companies. Any
other constraint failure must propagate instead of claiming a duplicate.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.profile.screening_answer_create_request import ScreeningAnswerCreateRequest
from app.schemas.profile.skill_create_request import SkillCreateRequest
from app.services.profile import profile_service


@pytest.mark.asyncio
async def test_skill_check_violation_propagates(
    db: AsyncSession, user_factory: Callable[..., Any],
) -> None:
    user = await user_factory()
    # Bypass schema validation to reach chk_skill_category.
    request = SkillCreateRequest.model_construct(name="Python", years_experience=None, category="bogus")

    with pytest.raises(IntegrityError):
        await profile_service.create_skill(db, uuid.UUID(user["id"]), request)


@pytest.mark.asyncio
async def test_duplicate_skill_still_maps_to_duplicate_error(
    db: AsyncSession, user_factory: Callable[..., Any],
) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    await profile_service.create_skill(db, user_id, SkillCreateRequest(name="Python"))

    with pytest.raises(profile_service.DuplicateSkillError):
        await profile_service.create_skill(db, user_id, SkillCreateRequest(name="python"))


@pytest.mark.asyncio
async def test_duplicate_screening_answer_still_maps_to_duplicate_error(
    db: AsyncSession, user_factory: Callable[..., Any],
) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    key = sorted(profile_service.ALLOWED_KEYS)[0]
    await profile_service.create_screening_answer(
        db, user_id, ScreeningAnswerCreateRequest(question_key=key, answer="yes"),
    )

    with pytest.raises(profile_service.DuplicateScreeningAnswerError):
        await profile_service.create_screening_answer(
            db, user_id, ScreeningAnswerCreateRequest(question_key=key, answer="no"),
        )
