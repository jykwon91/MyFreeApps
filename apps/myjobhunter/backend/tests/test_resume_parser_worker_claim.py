"""The resume parser holds no connection while Claude reads the resume, and
saves the result only for the claim it was made under.

The Claude call takes seconds to minutes. The job row is re-read, locked,
before anything is written: a job deleted, finished, failed or re-claimed
while Claude worked gets no second merge into the profile, and a failure
is recorded only while the job is still this worker's.
"""
from __future__ import annotations

import io
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import func, select, update

from app.db.session import engine as app_engine
from app.db.session import unit_of_work
from app.models.jobs.resume_upload_job import ResumeUploadJob
from app.models.profile.work_history import WorkHistory
from app.workers.resume_parser_worker import process_one

_RESUME_TEXT = "Jane Doe\nEngineer\n"
_CLAUDE_RESPONSE = {
    "work_history": [
        {
            "company": "Test Corp",
            "title": "Engineer",
            "location": "Remote",
            "starts_on": "2020-01",
            "ends_on": "2023-06",
            "is_current": False,
            "bullets": ["Built stuff"],
        },
    ],
    "education": [],
    "skills": [{"name": "Python", "category": "language", "years_experience": 3}],
    "summary": "A test engineer.",
    "headline": "Engineer",
}


def _storage() -> MagicMock:
    storage = MagicMock()
    storage.generate_key.return_value = "resumes/fake/resume.pdf"
    storage.upload_file.return_value = "resumes/fake/resume.pdf"
    storage.download_file.return_value = b"%PDF-1.4 placeholder"
    return storage


async def _upload(as_user: Any, user: dict, storage: MagicMock) -> uuid.UUID:
    async with await as_user(user) as authed:
        with patch("app.services.jobs.resume_upload_service.get_storage", return_value=storage):
            resp = await authed.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(b"%PDF-1.4 placeholder"), "application/pdf")},
            )
    assert resp.status_code == 201
    return uuid.UUID(resp.json()["id"])


async def _parse(storage: MagicMock, claude: Callable[..., Awaitable[dict]]) -> None:
    with (
        patch("app.workers.resume_parser_worker.get_storage", return_value=storage),
        patch(
            "app.workers.resume_parser_worker.extract_text",
            AsyncMock(return_value=(_RESUME_TEXT, len(_RESUME_TEXT))),
        ),
        patch("app.workers.resume_parser_worker.extract_resume", side_effect=claude),
    ):
        assert await process_one() is True


async def _job(job_id: uuid.UUID) -> ResumeUploadJob:
    async with unit_of_work() as db:
        job = await db.get(ResumeUploadJob, job_id)
        assert job is not None
        return job


async def _work_history_rows(user: dict) -> int:
    async with unit_of_work() as db:
        return (await db.execute(
            select(func.count()).select_from(WorkHistory).where(WorkHistory.user_id == uuid.UUID(user["id"])),
        )).scalar_one()


async def _change_job(job_id: uuid.UUID, **values: object) -> None:
    async with unit_of_work() as db:
        await db.execute(update(ResumeUploadJob).where(ResumeUploadJob.id == job_id).values(**values))


@pytest.mark.asyncio
async def test_no_connection_is_held_while_claude_reads_the_resume(user_factory, as_user) -> None:
    user = await user_factory()
    storage = _storage()
    job_id = await _upload(as_user, user, storage)
    checked_out: list[int] = []

    async def _claude(*_: object) -> dict:
        checked_out.append(app_engine.pool.checkedout())
        return _CLAUDE_RESPONSE

    await _parse(storage, _claude)

    assert checked_out == [0]
    assert (await _job(job_id)).status == "complete"


@pytest.mark.asyncio
async def test_a_job_failed_while_claude_worked_is_not_completed_or_merged(
    user_factory, as_user,
) -> None:
    user = await user_factory()
    storage = _storage()
    job_id = await _upload(as_user, user, storage)

    async def _claude(*_: object) -> dict:
        await _change_job(job_id, status="failed", error_message="stopped")
        return _CLAUDE_RESPONSE

    await _parse(storage, _claude)

    job = await _job(job_id)
    assert (job.status, job.error_message) == ("failed", "stopped")
    assert await _work_history_rows(user) == 0


@pytest.mark.asyncio
async def test_a_job_reclaimed_while_claude_worked_is_left_to_the_new_claim(
    user_factory, as_user,
) -> None:
    user = await user_factory()
    storage = _storage()
    job_id = await _upload(as_user, user, storage)
    later = datetime.now(timezone.utc) + timedelta(minutes=1)

    async def _claude(*_: object) -> dict:
        await _change_job(job_id, started_at=later)
        return _CLAUDE_RESPONSE

    await _parse(storage, _claude)

    job = await _job(job_id)
    assert job.status == "processing"
    assert job.result_parsed_fields is None
    assert await _work_history_rows(user) == 0


@pytest.mark.asyncio
async def test_a_failure_after_the_job_was_reclaimed_is_left_to_the_new_claim(
    user_factory, as_user,
) -> None:
    user = await user_factory()
    storage = _storage()
    job_id = await _upload(as_user, user, storage)
    later = datetime.now(timezone.utc) + timedelta(minutes=1)

    async def _claude_fails_after_the_job_is_reclaimed(*_: object) -> dict:
        await _change_job(job_id, started_at=later)
        raise ValueError("Claude returned invalid JSON")

    await _parse(storage, _claude_fails_after_the_job_is_reclaimed)

    job = await _job(job_id)
    assert (job.status, job.error_message, job.retry_count) == ("processing", None, 0)
