"""Re-uploading a resume must not duplicate work history or education.

Covers ``resume_profile_merge_service.merge_parsed_profile_rows`` against a
real database, plus the worker end to end (same parse processed twice).
"""
from __future__ import annotations

import io
import uuid
from datetime import date
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.mappers.resume_mapper import map_education, map_work_history
from app.models.profile.education import Education
from app.models.profile.work_history import WorkHistory
from app.services.profile import profile_service
from app.services.profile.resume_profile_merge_service import merge_parsed_profile_rows

_WORK: list[dict[str, Any]] = [
    {
        "company": "Test Corp",
        "title": "Engineer",
        "starts_on": "2020-01",
        "ends_on": "2023-06",
        "is_current": False,
        "bullets": ["Built stuff"],
    },
]
_EDU: list[dict[str, Any]] = [
    {
        "school": "State University",
        "degree": "B.S.",
        "field": "CS",
        "starts_on": "2016-09",
        "ends_on": "2020-05",
        "gpa": "3.5",
    },
]


async def _setup(db: AsyncSession, user_factory: Any) -> tuple[uuid.UUID, uuid.UUID]:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    profile = await profile_service.get_or_create_profile(db, user_id)
    return user_id, profile.id


async def _merge(
    db: AsyncSession,
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
    work: list[dict[str, Any]],
    edu: list[dict[str, Any]],
):
    result = await merge_parsed_profile_rows(
        db,
        user_id,
        map_work_history(work, user_id, profile_id),
        map_education(edu, user_id, profile_id),
    )
    await db.commit()
    return result


async def _work_rows(db: AsyncSession, user_id: uuid.UUID) -> list[WorkHistory]:
    result = await db.execute(
        select(WorkHistory)
        .where(WorkHistory.user_id == user_id)
        .execution_options(populate_existing=True),
    )
    return list(result.scalars().all())


async def _edu_rows(db: AsyncSession, user_id: uuid.UUID) -> list[Education]:
    result = await db.execute(
        select(Education)
        .where(Education.user_id == user_id)
        .execution_options(populate_existing=True),
    )
    return list(result.scalars().all())


@pytest.mark.asyncio
async def test_same_parse_twice_adds_no_duplicates(db, user_factory) -> None:
    user_id, profile_id = await _setup(db, user_factory)

    first = await _merge(db, user_id, profile_id, _WORK, _EDU)
    second = await _merge(db, user_id, profile_id, _WORK, _EDU)

    assert (first.work_history_added, first.education_added) == (1, 1)
    assert (second.work_history_added, second.work_history_matched) == (0, 1)
    assert (second.education_added, second.education_matched) == (0, 1)
    assert len(await _work_rows(db, user_id)) == 1
    assert len(await _edu_rows(db, user_id)) == 1


@pytest.mark.asyncio
async def test_new_role_is_added_alongside_existing(db, user_factory) -> None:
    user_id, profile_id = await _setup(db, user_factory)
    await _merge(db, user_id, profile_id, _WORK, _EDU)

    new_role = {**_WORK[0], "company": "Next Co", "starts_on": "2023-07", "ends_on": None, "is_current": True}
    result = await _merge(db, user_id, profile_id, [*_WORK, new_role], _EDU)

    assert (result.work_history_added, result.work_history_matched) == (1, 1)
    companies = sorted(row.company_name for row in await _work_rows(db, user_id))
    assert companies == ["Next Co", "Test Corp"]


@pytest.mark.asyncio
async def test_existing_empty_end_date_gets_filled(db, user_factory) -> None:
    user_id, profile_id = await _setup(db, user_factory)
    await _merge(db, user_id, profile_id, [{**_WORK[0], "ends_on": None}], [])
    assert (await _work_rows(db, user_id))[0].end_date is None

    await _merge(db, user_id, profile_id, _WORK, [])

    rows = await _work_rows(db, user_id)
    assert len(rows) == 1
    assert rows[0].end_date == date(2023, 6, 1)


@pytest.mark.asyncio
async def test_user_edited_text_is_kept(db, user_factory) -> None:
    user_id, profile_id = await _setup(db, user_factory)
    await _merge(db, user_id, profile_id, _WORK, _EDU)

    work = (await _work_rows(db, user_id))[0]
    edu = (await _edu_rows(db, user_id))[0]
    work.bullets = ["My own rewritten bullet"]
    work.end_date = date(2023, 8, 1)
    edu.field = "Computer Science"
    await db.commit()

    await _merge(db, user_id, profile_id, _WORK, _EDU)

    work = (await _work_rows(db, user_id))[0]
    edu = (await _edu_rows(db, user_id))[0]
    assert work.bullets == ["My own rewritten bullet"]
    assert work.end_date == date(2023, 8, 1)
    assert edu.field == "Computer Science"


@pytest.mark.asyncio
async def test_duplicates_inside_one_parse_collapse(db, user_factory) -> None:
    user_id, profile_id = await _setup(db, user_factory)
    repeated_work = [
        {**_WORK[0], "ends_on": None, "bullets": []},
        {**_WORK[0], "company": " test corp ", "title": "ENGINEER"},
    ]
    repeated_edu = [{**_EDU[0], "field": None}, {**_EDU[0], "school": "state university"}]

    result = await _merge(db, user_id, profile_id, repeated_work, repeated_edu)

    assert (result.work_history_added, result.work_history_matched) == (1, 1)
    assert (result.education_added, result.education_matched) == (1, 1)
    work_rows = await _work_rows(db, user_id)
    edu_rows = await _edu_rows(db, user_id)
    assert len(work_rows) == 1
    assert len(edu_rows) == 1
    # The second copy filled what the first one lacked.
    assert work_rows[0].end_date == date(2023, 6, 1)
    assert work_rows[0].bullets == ["Built stuff"]
    assert edu_rows[0].field == "CS"


@pytest.mark.asyncio
async def test_other_users_rows_are_not_matched(db, user_factory) -> None:
    user_id, profile_id = await _setup(db, user_factory)
    other_id, other_profile_id = await _setup(db, user_factory)
    await _merge(db, other_id, other_profile_id, _WORK, _EDU)

    result = await _merge(db, user_id, profile_id, _WORK, _EDU)

    assert (result.work_history_added, result.education_added) == (1, 1)
    assert len(await _work_rows(db, other_id)) == 1


def _fake_storage(data: bytes) -> MagicMock:
    storage = MagicMock()
    storage.generate_key.return_value = "resumes/fake-uuid/resume.pdf"
    storage.upload_file.return_value = "resumes/fake-uuid/resume.pdf"
    storage.generate_presigned_url.return_value = "https://example.com/presigned/resume.pdf"
    storage.download_file.return_value = data
    return storage


@pytest.mark.asyncio
async def test_worker_uploading_same_resume_twice_adds_no_duplicates(
    db, user_factory, as_user,
) -> None:
    from app.workers.resume_parser_worker import process_one

    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    pdf_bytes = b"%PDF-1.4 placeholder"
    text = "Jane Doe\nEngineer\n"
    storage = _fake_storage(pdf_bytes)
    claude = AsyncMock(return_value={"work_history": _WORK, "education": _EDU, "skills": []})
    extractor = MagicMock(return_value=(text, len(text)))

    for _ in range(2):
        async with (await as_user(user)) as authed:
            with patch("app.services.jobs.resume_upload_service.get_storage", return_value=storage):
                resp = await authed.post(
                    "/resumes",
                    files={"file": ("resume.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
                )
        assert resp.status_code == 201
        with (
            patch("app.core.storage.get_storage", return_value=storage),
            patch("app.workers.resume_parser_worker.extract_text", extractor),
            patch("app.workers.resume_parser_worker.extract_resume", claude),
        ):
            assert await process_one() is True

    assert len(await _work_rows(db, user_id)) == 1
    assert len(await _edu_rows(db, user_id)) == 1
