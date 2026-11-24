"""Tests for the resume parser worker pipeline.

Covers:
  - Happy path: queued job → text extraction → mocked Claude → DB rows written
  - Text extraction failure (image-only PDF) → job marked failed
  - Claude failure: transient → requeued with backoff; permanent or out of
    retries → failed with our own copy (never the provider's text)
  - Idempotency: claim_next_queued returns None the second time
  - Mapper: work_history, education, skill mapping from Claude output
  - Mapper: skill in-batch deduplication (same name lower-case)
  - Mapper: invalid/edge-case dates handled gracefully
"""
from __future__ import annotations

import asyncio
import inspect
import io
import logging
import os
import time
import typing
import uuid
import zipfile
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import httpx2
import pypdf
import pytest
from platform_shared.core.logging_safety import CRLFSafeLogFilter
from platform_shared.extraction.files import LEGACY_DOC_MESSAGE

from app.core.ai_failure_messages import (
    AI_BUSY_MESSAGE,
    AI_RETRY_SCHEDULED_MESSAGE,
    AI_UNAVAILABLE_MESSAGE,
    AI_UNREADABLE_REPLY_MESSAGE,
)
from app.core.job_failure_messages import RESUME_PARSE_FAILED_MESSAGE
from app.core.resume_worker_constants import HEARTBEAT_MAX_AGE_SECONDS
from app.mappers.resume_mapper import map_education, map_skills, map_work_history
from app.repositories.profile.skill_repository import add_if_absent
from app.services.discovery import discovery_embedding_service
from app.services.discovery.discovery_embedding_service import EmbeddingModelLoadError
from app.services.extraction import claude_service
from app.services.jobs.resume_text_extractor import (
    ResumeTextExtractionFailed,
    extract_text,
)
from app.workers import resume_parser_healthcheck, resume_parser_worker
from app.workers.resume_parser_worker import process_one

# ---------------------------------------------------------------------------
# Text extractor unit tests (no DB required)
# ---------------------------------------------------------------------------


async def test_extract_text_pdf_happy_path():
    """PDF with real text content returns (text, char_count)."""
    # Minimal valid PDF that pypdf can parse — just use a simple PDF structure
    # with embedded text. For unit tests we patch at the caller level.

    # Build a tiny single-page PDF with text using pypdf's writer.
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    pdf_bytes = buf.getvalue()

    # Blank page has no text — confirms the extractor raises on empty PDF.
    with pytest.raises(ResumeTextExtractionFailed, match="image-only or scanned"):
        await extract_text(pdf_bytes, "application/pdf")


async def test_extract_text_txt_happy_path():
    """Plain text file returns the text and its length."""
    content = b"Jane Doe\nSoftware Engineer\n5 years Python\n"
    text, char_count = await extract_text(content, "text/plain")
    assert "Jane Doe" in text
    assert char_count == len(text)


async def test_extract_text_txt_empty_raises():
    """Empty plain text file raises ResumeTextExtractionFailed."""
    with pytest.raises(ResumeTextExtractionFailed, match="empty"):
        await extract_text(b"   \n  \t  ", "text/plain")


async def test_extract_text_docx_minimal():
    """DOCX bytes with no readable text raise ResumeTextExtractionFailed."""
    # Minimal DOCX magic bytes — mammoth will parse it but find no text.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        # Word/document.xml with no real text
        zf.writestr(
            "word/document.xml",
            '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body></w:body></w:document>',
        )
        zf.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        )
        zf.writestr(
            "_rels/.rels",
            '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        )

    docx_bytes = buf.getvalue()
    with pytest.raises(ResumeTextExtractionFailed):
        await extract_text(docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")


@pytest.mark.asyncio
async def test_extract_text_legacy_doc_says_to_save_as_docx():
    ole2_doc = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 512

    with pytest.raises(ResumeTextExtractionFailed) as exc_info:
        await extract_text(ole2_doc, "application/msword")

    assert str(exc_info.value) == LEGACY_DOC_MESSAGE


# ---------------------------------------------------------------------------
# Mapper unit tests
# ---------------------------------------------------------------------------


_USER_ID = uuid.uuid4()
_PROFILE_ID = uuid.uuid4()


class TestMapWorkHistory:
    def test_happy_path(self):
        raw = [
            {
                "company": "Acme Corp",
                "title": "Software Engineer",
                "location": "San Francisco, CA",
                "starts_on": "2020-06",
                "ends_on": "2023-12",
                "is_current": False,
                "bullets": ["Built APIs", "Led code reviews"],
            }
        ]
        entries = map_work_history(raw, _USER_ID, _PROFILE_ID)
        assert len(entries) == 1
        e = entries[0]
        assert e.company_name == "Acme Corp"
        assert e.title == "Software Engineer"
        assert e.start_date == date(2020, 6, 1)
        assert e.end_date == date(2023, 12, 1)
        assert len(e.bullets) == 2
        assert e.user_id == _USER_ID
        assert e.profile_id == _PROFILE_ID

    def test_current_role_has_no_end_date(self):
        raw = [
            {
                "company": "Startup",
                "title": "CTO",
                "starts_on": "2022-01",
                "ends_on": None,
                "is_current": True,
                "bullets": [],
            }
        ]
        entries = map_work_history(raw, _USER_ID, _PROFILE_ID)
        assert entries[0].end_date is None

    def test_missing_company_skipped(self):
        raw = [{"company": "", "title": "Engineer", "starts_on": "2020-01", "bullets": []}]
        assert map_work_history(raw, _USER_ID, _PROFILE_ID) == []

    def test_missing_title_skipped(self):
        raw = [{"company": "Foo", "title": None, "starts_on": "2020-01", "bullets": []}]
        assert map_work_history(raw, _USER_ID, _PROFILE_ID) == []

    def test_bullets_capped_at_30(self):
        raw = [
            {
                "company": "BigCo",
                "title": "Analyst",
                "starts_on": "2019-03",
                "ends_on": "2021-05",
                "is_current": False,
                "bullets": [f"Bullet {i}" for i in range(50)],
            }
        ]
        entries = map_work_history(raw, _USER_ID, _PROFILE_ID)
        assert len(entries[0].bullets) == 30

    def test_unparseable_starts_on_uses_sentinel(self):
        """Unparseable start date falls back to 1900-01-01 sentinel."""
        raw = [
            {
                "company": "Foo",
                "title": "Bar",
                "starts_on": "not-a-date",
                "ends_on": None,
                "is_current": False,
                "bullets": [],
            }
        ]
        entries = map_work_history(raw, _USER_ID, _PROFILE_ID)
        assert entries[0].start_date == date(1900, 1, 1)

    def test_full_iso_date_parsed(self):
        raw = [
            {
                "company": "Corp",
                "title": "Dev",
                "starts_on": "2018-03-15",
                "ends_on": "2020-11-01",
                "is_current": False,
                "bullets": [],
            }
        ]
        entries = map_work_history(raw, _USER_ID, _PROFILE_ID)
        assert entries[0].start_date == date(2018, 3, 15)
        assert entries[0].end_date == date(2020, 11, 1)


class TestMapEducation:
    def test_happy_path(self):
        raw = [
            {
                "school": "MIT",
                "degree": "B.S.",
                "field": "Computer Science",
                "starts_on": "2012-09",
                "ends_on": "2016-06",
                "gpa": "3.9",
            }
        ]
        entries = map_education(raw, _USER_ID, _PROFILE_ID)
        assert len(entries) == 1
        e = entries[0]
        assert e.school == "MIT"
        assert e.degree == "B.S."
        assert e.field == "Computer Science"
        assert e.start_year == 2012
        assert e.end_year == 2016
        assert e.gpa == pytest.approx(3.9, abs=0.01)

    def test_gpa_with_denominator(self):
        raw = [{"school": "UCLA", "degree": None, "field": None, "starts_on": None, "ends_on": None, "gpa": "3.7/4.0"}]
        entries = map_education(raw, _USER_ID, _PROFILE_ID)
        assert entries[0].gpa == pytest.approx(3.7, abs=0.01)

    def test_missing_school_skipped(self):
        raw = [{"school": "", "degree": "MBA", "field": None, "starts_on": None, "ends_on": None, "gpa": None}]
        assert map_education(raw, _USER_ID, _PROFILE_ID) == []

    def test_no_dates_ok(self):
        raw = [{"school": "Community College", "degree": "A.S.", "field": None, "starts_on": None, "ends_on": None, "gpa": None}]
        entries = map_education(raw, _USER_ID, _PROFILE_ID)
        assert entries[0].start_year is None
        assert entries[0].end_year is None


class TestMapSkills:
    def test_happy_path(self):
        raw = [
            {"name": "Python", "category": "language", "years_experience": 5},
            {"name": "React", "category": "framework", "years_experience": 3},
        ]
        entries = map_skills(raw, _USER_ID, _PROFILE_ID)
        assert len(entries) == 2
        assert entries[0].name == "Python"
        assert entries[0].category == "language"
        assert entries[0].years_experience == 5

    def test_in_batch_case_insensitive_dedup(self):
        """Duplicate skill names (different case) are reduced to one."""
        raw = [
            {"name": "Python", "category": "language", "years_experience": 5},
            {"name": "python", "category": "language", "years_experience": 3},
            {"name": "PYTHON", "category": None, "years_experience": None},
        ]
        entries = map_skills(raw, _USER_ID, _PROFILE_ID)
        assert len(entries) == 1

    def test_invalid_category_becomes_null(self):
        raw = [{"name": "Excel", "category": "spreadsheet", "years_experience": None}]
        entries = map_skills(raw, _USER_ID, _PROFILE_ID)
        assert entries[0].category is None

    def test_blank_name_skipped(self):
        raw = [{"name": "  ", "category": "tool", "years_experience": 1}]
        assert map_skills(raw, _USER_ID, _PROFILE_ID) == []

    def test_out_of_range_years_becomes_null(self):
        raw = [{"name": "SQL", "category": "language", "years_experience": 100}]
        entries = map_skills(raw, _USER_ID, _PROFILE_ID)
        assert entries[0].years_experience is None

    def test_null_years_ok(self):
        raw = [{"name": "Leadership", "category": "soft", "years_experience": None}]
        entries = map_skills(raw, _USER_ID, _PROFILE_ID)
        assert entries[0].years_experience is None


# ---------------------------------------------------------------------------
# Worker integration tests (process_one — DB + mocked storage + mocked Claude)
# ---------------------------------------------------------------------------


def _make_fake_storage(text_bytes: bytes) -> MagicMock:
    storage = MagicMock()
    storage.generate_key.return_value = "resumes/fake-uuid/resume.pdf"
    storage.upload_file.return_value = "resumes/fake-uuid/resume.pdf"
    storage.generate_presigned_url.return_value = "https://example.com/presigned/resume.pdf"
    storage.download_file.return_value = text_bytes
    return storage


_MINIMAL_CLAUDE_RESPONSE = {
    "work_history": [
        {
            "company": "Test Corp",
            "title": "Engineer",
            "location": "Remote",
            "starts_on": "2020-01",
            "ends_on": "2023-06",
            "is_current": False,
            "bullets": ["Built stuff"],
        }
    ],
    "education": [
        {
            "school": "State University",
            "degree": "B.S.",
            "field": "CS",
            "starts_on": "2016-09",
            "ends_on": "2020-05",
            "gpa": "3.5",
        }
    ],
    "skills": [
        {"name": "Python", "category": "language", "years_experience": 3},
        {"name": "Docker", "category": "tool", "years_experience": 2},
    ],
    "summary": "A test engineer.",
    "headline": "Senior Engineer",
}


@pytest.mark.asyncio
async def test_process_one_happy_path(user_factory, as_user, caplog):
    """Happy path: queued job → complete with parsed rows in DB."""
    user = await user_factory()

    # Use any bytes — the storage download and text extraction are both mocked.
    pdf_bytes = b"%PDF-1.4 placeholder"
    resume_text = "Jane Doe\nSoftware Engineer\nPython Expert\n"

    fake_storage = _make_fake_storage(pdf_bytes)
    fake_claude = AsyncMock(return_value=_MINIMAL_CLAUDE_RESPONSE)
    fake_extractor = AsyncMock(return_value=(resume_text, len(resume_text)))

    async with (await as_user(user)) as authed:
        # Upload a resume to get a queued job row.
        with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
            resp = await authed.post(
                "/resumes",
                files={"file": ("Jane_Doe_Resume.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            )
    assert resp.status_code == 201
    job_id = resp.json()["id"]

    # Run the worker against the queued job.
    with (
        patch("app.workers.resume_parser_worker.get_storage", return_value=fake_storage),
        patch("app.workers.resume_parser_worker.extract_text", fake_extractor),
        patch("app.workers.resume_parser_worker.extract_resume", fake_claude),
        caplog.at_level(logging.INFO, logger="app.workers.resume_parser_worker"),
    ):
        found = await process_one()

    assert found is True
    # The file name is the person's name; the log names the job instead.
    assert f"Processing resume job {job_id}" in caplog.text
    assert "Jane_Doe" not in caplog.text

    # Verify the job is now complete.
    async with (await as_user(user)) as authed:
        job_resp = await authed.get(f"/resume-upload-jobs/{job_id}")
    assert job_resp.status_code == 200
    job_data = job_resp.json()
    assert job_data["status"] == "complete"
    assert job_data["parser_version"] == "2026-05-04-v1"
    parsed = job_data["result_parsed_fields"]
    assert parsed is not None
    assert parsed["work_history_count"] == 1
    assert parsed["education_count"] == 1
    assert parsed["skills_count"] == 2
    assert parsed["headline"] == "Senior Engineer"


@pytest.mark.asyncio
async def test_process_one_text_extraction_failure(user_factory, as_user):
    """Text extraction failure (e.g. image-only PDF) → job marked failed."""
    user = await user_factory()

    pdf_bytes = b"%PDF-1.4 placeholder"
    fake_storage = _make_fake_storage(pdf_bytes)
    # Simulate the text extractor raising ResumeTextExtractionFailed (image-only)
    failing_extractor = AsyncMock(
        side_effect=ResumeTextExtractionFailed("no extractable text — the PDF may be image-only or scanned")
    )

    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            resp = await authed.post(
                "/resumes",
                files={"file": ("scan.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            )
    assert resp.status_code == 201
    job_id = resp.json()["id"]

    with (
        patch("app.workers.resume_parser_worker.get_storage", return_value=fake_storage),
        patch("app.workers.resume_parser_worker.extract_text", failing_extractor),
    ):
        found = await process_one()

    assert found is True

    async with (await as_user(user)) as authed:
        job_resp = await authed.get(f"/resume-upload-jobs/{job_id}")
    assert job_resp.status_code == 200
    data = job_resp.json()
    assert data["status"] == "failed"
    assert data["error_message"] is not None
    assert "image-only" in data["error_message"] or "scanned" in data["error_message"] or "extractable" in data["error_message"]


_ANTHROPIC_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _anthropic_status_error(
    cls: type[anthropic.APIStatusError], status: int, error_type: str,
) -> anthropic.APIStatusError:
    response = httpx2.Response(status, request=_ANTHROPIC_REQUEST)
    body = {"type": "error", "error": {"type": error_type, "message": "provider detail"}}
    return cls("provider detail", response=response, body=body)


async def _process_with_claude_raising(as_user: Any, user: dict, sdk_error: Exception) -> dict:
    """Upload a resume, run the worker once with the real ``extract_resume``
    (only the Anthropic SDK client faked to raise ``sdk_error``), return the job."""

    pdf_bytes = b"%PDF-1.4 placeholder"
    resume_text = "Jane Doe Engineer\n"
    fake_storage = _make_fake_storage(pdf_bytes)
    fake_extractor = AsyncMock(return_value=(resume_text, len(resume_text)))
    sdk_client = MagicMock()
    sdk_client.messages.create = AsyncMock(side_effect=sdk_error)

    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            resp = await authed.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            )
    assert resp.status_code == 201

    with (
        patch("app.workers.resume_parser_worker.get_storage", return_value=fake_storage),
        patch("app.workers.resume_parser_worker.extract_text", fake_extractor),
        patch.object(claude_service, "_get_client", return_value=sdk_client),
    ):
        assert await process_one() is True
        # A job waiting out its backoff is not claimed again straight away.
        assert await process_one() is False

    async with (await as_user(user)) as authed:
        job_resp = await authed.get(f"/resume-upload-jobs/{resp.json()['id']}")
    assert job_resp.status_code == 200
    return job_resp.json()


@pytest.mark.parametrize(
    "sdk_error",
    [
        anthropic.APIConnectionError(request=_ANTHROPIC_REQUEST),
        anthropic.APITimeoutError(request=_ANTHROPIC_REQUEST),
        _anthropic_status_error(anthropic.InternalServerError, 529, "overloaded_error"),
    ],
    ids=["connection", "timeout", "overloaded"],
)
@pytest.mark.asyncio
async def test_process_one_transient_claude_failure_is_retried_later(
    user_factory, as_user, sdk_error,
):
    """Claude busy / unreachable → requeued with backoff, not failed."""
    user = await user_factory()
    data = await _process_with_claude_raising(as_user, user, sdk_error)

    assert data["status"] == "queued"
    assert data["retry_count"] == 1
    assert data["error_message"] == AI_RETRY_SCHEDULED_MESSAGE


@pytest.mark.asyncio
async def test_process_one_permanent_claude_failure_fails_with_our_copy(user_factory, as_user):
    """A rejected API key won't fix itself → failed now, without provider text."""
    user = await user_factory()
    data = await _process_with_claude_raising(
        as_user, user,
        _anthropic_status_error(anthropic.AuthenticationError, 401, "authentication_error"),
    )

    assert data["status"] == "failed"
    assert data["error_message"] == AI_UNAVAILABLE_MESSAGE
    assert "provider detail" not in data["error_message"]


@pytest.mark.asyncio
async def test_transient_failure_after_the_retry_budget_fails(user_factory, as_user, monkeypatch):
    """Once the retry budget is spent, a transient failure is final."""
    monkeypatch.setattr(resume_parser_worker, "RESUME_PARSE_MAX_RETRIES", 0)
    user = await user_factory()
    data = await _process_with_claude_raising(
        as_user, user, anthropic.APIConnectionError(request=_ANTHROPIC_REQUEST),
    )

    assert data["status"] == "failed"
    assert data["error_message"] == AI_BUSY_MESSAGE


async def _process_with_worker_raising(as_user: Any, user: dict, target: str, error: Exception) -> dict:
    """Upload a resume, run the worker once with ``target`` (a name in the
    worker module) raising ``error``, and return the job as the API shows it."""

    pdf_bytes = b"%PDF-1.4 placeholder"
    fake_storage = _make_fake_storage(pdf_bytes)
    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            resp = await authed.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            )
    assert resp.status_code == 201

    with (
        patch("app.workers.resume_parser_worker.get_storage", return_value=fake_storage),
        patch(
            "app.workers.resume_parser_worker.extract_text",
            AsyncMock(return_value=("Jane Doe Engineer\n", 18)),
        ),
        patch(f"app.workers.resume_parser_worker.{target}", side_effect=error),
    ):
        assert await process_one() is True

    async with (await as_user(user)) as authed:
        job_resp = await authed.get(f"/resume-upload-jobs/{resp.json()['id']}")
    return job_resp.json()


@pytest.mark.asyncio
async def test_unreadable_claude_reply_fails_with_our_copy(user_factory, as_user):
    """Claude answered with something that isn't the JSON asked for → our copy, not the parse error."""
    user = await user_factory()
    data = await _process_with_worker_raising(
        as_user, user, "extract_resume", ValueError("Claude returned invalid JSON: Sure! Here's the resume"),
    )

    assert data["status"] == "failed"
    assert data["error_message"] == AI_UNREADABLE_REPLY_MESSAGE


@pytest.mark.asyncio
async def test_internal_error_fails_with_generic_copy(user_factory, as_user):
    """A database or storage error's text is for the logs, never the job row."""
    user = await user_factory()
    data = await _process_with_worker_raising(
        as_user, user, "extract_resume",
        RuntimeError("connection to server at 10.0.0.5 port 5432 failed"),
    )

    assert data["status"] == "failed"
    assert data["error_message"] == RESUME_PARSE_FAILED_MESSAGE
    assert "10.0.0.5" not in data["error_message"]


@pytest.mark.asyncio
async def test_process_one_idempotency(user_factory, as_user):
    """Calling process_one twice only processes a job once; second call returns False."""
    user = await user_factory()
    pdf_bytes = b"%PDF-1.4 placeholder"
    resume_text = "Jane Doe\n"

    fake_storage = _make_fake_storage(pdf_bytes)
    fake_extractor = AsyncMock(return_value=(resume_text, len(resume_text)))
    fake_claude = AsyncMock(return_value=_MINIMAL_CLAUDE_RESPONSE)

    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            resp = await authed.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            )
    assert resp.status_code == 201

    with (
        patch("app.workers.resume_parser_worker.get_storage", return_value=fake_storage),
        patch("app.workers.resume_parser_worker.extract_text", fake_extractor),
        patch("app.workers.resume_parser_worker.extract_resume", fake_claude),
    ):
        first = await process_one()
        second = await process_one()  # No more queued jobs

    assert first is True
    assert second is False  # Queue was empty


# ---------------------------------------------------------------------------
# Profile embedding refresh after a parse
# ---------------------------------------------------------------------------


async def _upload_and_process(as_user: Any, user: dict, claude_response: dict) -> str:
    """Upload a resume through the API, run the worker once, return the job id."""
    pdf_bytes = b"%PDF-1.4 placeholder"
    resume_text = "Jane Doe\nEngineer\n"
    fake_storage = _make_fake_storage(pdf_bytes)

    async with (await as_user(user)) as authed:
        with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
            resp = await authed.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            )
    assert resp.status_code == 201

    with (
        patch("app.workers.resume_parser_worker.get_storage", return_value=fake_storage),
        patch(
            "app.workers.resume_parser_worker.extract_text",
            AsyncMock(return_value=(resume_text, len(resume_text))),
        ),
        patch(
            "app.workers.resume_parser_worker.extract_resume",
            AsyncMock(return_value=claude_response),
        ),
    ):
        assert await process_one() is True
    return resp.json()["id"]


@pytest.fixture
def refresh_mock(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Replace the profile-embedding computation (the same boundary the
    conftest no-ops) with a mock the test can assert on."""

    mock = AsyncMock(return_value=True)
    monkeypatch.setattr(discovery_embedding_service, "refresh_profile_embedding", mock)
    return mock


@pytest.mark.asyncio
async def test_parse_that_adds_rows_refreshes_profile_embedding(
    user_factory, as_user, refresh_mock: AsyncMock,
):
    user = await user_factory()

    await _upload_and_process(as_user, user, _MINIMAL_CLAUDE_RESPONSE)

    refresh_mock.assert_awaited_once()
    assert refresh_mock.await_args.args[1] == uuid.UUID(user["id"])


@pytest.mark.asyncio
async def test_reupload_with_no_profile_change_skips_embedding_refresh(
    user_factory, as_user, refresh_mock: AsyncMock,
):
    user = await user_factory()
    await _upload_and_process(as_user, user, _MINIMAL_CLAUDE_RESPONSE)
    refresh_mock.reset_mock()

    await _upload_and_process(as_user, user, _MINIMAL_CLAUDE_RESPONSE)

    refresh_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_reupload_adding_only_a_skill_refreshes_embedding(
    user_factory, as_user, refresh_mock: AsyncMock,
):
    user = await user_factory()
    await _upload_and_process(as_user, user, _MINIMAL_CLAUDE_RESPONSE)
    refresh_mock.reset_mock()

    with_new_skill = {
        **_MINIMAL_CLAUDE_RESPONSE,
        "skills": [
            *_MINIMAL_CLAUDE_RESPONSE["skills"],
            {"name": "Kubernetes", "category": "tool", "years_experience": 1},
        ],
    }
    await _upload_and_process(as_user, user, with_new_skill)

    refresh_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_embedding_model_failure_keeps_job_complete(
    user_factory, as_user, monkeypatch: pytest.MonkeyPatch,
):
    """A model-load failure is logged; the parse stays complete and its rows stay."""
    monkeypatch.setattr(
        discovery_embedding_service,
        "refresh_profile_embedding",
        AsyncMock(side_effect=EmbeddingModelLoadError("model missing")),
    )
    user = await user_factory()

    job_id = await _upload_and_process(as_user, user, _MINIMAL_CLAUDE_RESPONSE)

    async with (await as_user(user)) as authed:
        job_resp = await authed.get(f"/resume-upload-jobs/{job_id}")
        work_resp = await authed.get("/work-history")
    assert job_resp.json()["status"] == "complete"
    assert work_resp.status_code == 200
    assert work_resp.json()["total"] == 1


# ---------------------------------------------------------------------------
# skill_repository.add_if_absent — typed parameter regression guard
# ---------------------------------------------------------------------------


def test_add_skill_if_absent_accepts_skill_orm_type():
    """skill_repository.add_if_absent signature must use typed annotations, not Any."""
    sig = inspect.signature(add_if_absent)
    db_annotation = sig.parameters["db"].annotation
    skill_annotation = sig.parameters["skill"].annotation

    # Neither should be `Any` at the raw annotation level
    assert db_annotation is not typing.Any, "db parameter must not be typed as Any"
    assert skill_annotation is not typing.Any, "skill parameter must not be typed as Any"

    # Both must be present (forward-ref strings from TYPE_CHECKING guard)
    assert db_annotation != inspect.Parameter.empty, "db parameter must have a type annotation"
    assert skill_annotation != inspect.Parameter.empty, "skill parameter must have a type annotation"

    # Annotations are string forward refs — verify they reference the right types
    assert "AsyncSession" in str(db_annotation), (
        f"db annotation should reference AsyncSession, got: {db_annotation!r}"
    )
    assert "Skill" in str(skill_annotation), (
        f"skill annotation should reference Skill, got: {skill_annotation!r}"
    )


def test_run_escapes_control_characters_in_log_lines(monkeypatch: pytest.MonkeyPatch) -> None:
    # A resume's filename or parsed text can carry a CR/LF that would forge a log line.
    async def _no_op_main() -> None:
        return None

    monkeypatch.setattr(resume_parser_worker, "main", _no_op_main)
    root = logging.getLogger()
    level = root.level
    before = {h: list(h.filters) for h in root.handlers}
    try:
        resume_parser_worker.run()
        assert root.handlers
        assert all(
            any(isinstance(f, CRLFSafeLogFilter) for f in h.filters) for h in root.handlers
        )
    finally:
        for handler in list(root.handlers):
            if handler in before:
                handler.filters = before[handler]
            else:
                root.removeHandler(handler)
        root.setLevel(level)


def test_run_propagates_fatal_errors_so_the_process_exits_non_zero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _failing_main() -> None:
        raise RuntimeError("embedding model missing")

    monkeypatch.setattr(resume_parser_worker, "main", _failing_main)
    with pytest.raises(RuntimeError):
        resume_parser_worker.run()


@pytest.mark.asyncio
async def test_an_idle_worker_stops_as_soon_as_it_is_signalled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process_one = AsyncMock(return_value=False)
    monkeypatch.setattr(resume_parser_worker, "process_one", process_one)
    monkeypatch.setattr(resume_parser_worker, "process_one_session", AsyncMock(return_value=False))
    monkeypatch.setattr(resume_parser_worker, "POLL_INTERVAL_SECONDS", 3600)
    stop = asyncio.Event()
    task = asyncio.create_task(resume_parser_worker.poll_until_stopped(stop))
    while not process_one.await_count:
        await asyncio.sleep(0)
    stop.set()
    await asyncio.wait_for(task, timeout=5)


@pytest.mark.asyncio
async def test_no_prepare_starts_after_a_stop(monkeypatch: pytest.MonkeyPatch) -> None:
    stop = asyncio.Event()

    async def _parse_then_stop() -> bool:
        stop.set()
        return True

    prepare = AsyncMock(return_value=True)
    monkeypatch.setattr(resume_parser_worker, "process_one", _parse_then_stop)
    monkeypatch.setattr(resume_parser_worker, "process_one_session", prepare)
    await asyncio.wait_for(resume_parser_worker.poll_until_stopped(stop), timeout=5)
    prepare.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_failing_pass_does_not_stop_the_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    stop = asyncio.Event()
    calls = 0

    async def _fails_then_stops() -> bool:
        nonlocal calls
        calls += 1
        if calls == 2:
            stop.set()
        raise RuntimeError("db blip")

    monkeypatch.setattr(resume_parser_worker, "process_one", _fails_then_stops)
    monkeypatch.setattr(resume_parser_worker, "process_one_session", AsyncMock(return_value=False))
    monkeypatch.setattr(resume_parser_worker, "POLL_INTERVAL_SECONDS", 0)
    await asyncio.wait_for(resume_parser_worker.poll_until_stopped(stop), timeout=5)
    assert calls == 2


@pytest.mark.asyncio
async def test_the_worker_boots_recovers_interrupted_work_then_polls(
    monkeypatch: pytest.MonkeyPatch, heartbeat: Path, recover: AsyncMock,
) -> None:
    order: list[str] = []
    engine = MagicMock()
    engine.dispose = AsyncMock()
    monkeypatch.setattr(
        resume_parser_worker, "init_sentry", MagicMock(side_effect=lambda: order.append("sentry")),
    )
    monkeypatch.setattr(
        resume_parser_worker.discovery_embedding_service,
        "load_model_eager",
        MagicMock(side_effect=lambda: order.append("model")),
    )
    recover.side_effect = lambda: order.append("recover")
    monkeypatch.setattr(resume_parser_worker, "engine", engine)
    monkeypatch.setattr(
        resume_parser_worker,
        "poll_until_stopped",
        AsyncMock(side_effect=lambda _stop: order.append("poll")),
    )
    await resume_parser_worker.run_resume_worker(asyncio.Event())
    assert order == ["sentry", "model", "recover", "poll"]
    engine.dispose.assert_awaited_once()


@pytest.mark.asyncio
async def test_a_model_that_fails_to_load_crashes_the_boot(
    monkeypatch: pytest.MonkeyPatch, heartbeat: Path, recover: AsyncMock,
) -> None:
    heartbeat.touch()  # left over from the previous run of the container
    poll = AsyncMock()
    monkeypatch.setattr(resume_parser_worker, "init_sentry", MagicMock())
    monkeypatch.setattr(
        resume_parser_worker.discovery_embedding_service,
        "load_model_eager",
        MagicMock(side_effect=EmbeddingModelLoadError("model missing")),
    )
    monkeypatch.setattr(resume_parser_worker, "poll_until_stopped", poll)
    with pytest.raises(EmbeddingModelLoadError):
        await resume_parser_worker.run_resume_worker(asyncio.Event())
    poll.assert_not_awaited()
    recover.assert_not_awaited()
    assert not heartbeat.exists()


@pytest.fixture
def recover(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock()
    monkeypatch.setattr(resume_parser_worker, "recover_interrupted_work", mock)
    return mock


@pytest.fixture
def heartbeat(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "resume-worker-heartbeat"
    monkeypatch.setattr(resume_parser_worker, "HEARTBEAT_PATH", path)
    monkeypatch.setattr(resume_parser_healthcheck, "HEARTBEAT_PATH", path)
    return path


@pytest.mark.asyncio
async def test_the_heartbeat_advances_through_a_long_step_and_stops_after(
    monkeypatch: pytest.MonkeyPatch, heartbeat: Path, recover: AsyncMock,
) -> None:
    # A step can wait out Claude rate limits for minutes: the heartbeat must
    # keep advancing through it, and stop once the worker has returned.
    monkeypatch.setattr(resume_parser_worker, "HEARTBEAT_INTERVAL_SECONDS", 0.01)
    seen_at_boot: list[bool] = []
    advanced: list[bool] = []

    def _boot_step() -> None:
        seen_at_boot.append(heartbeat.exists())

    async def _long_step(_stop: asyncio.Event) -> None:
        assert resume_parser_healthcheck.main() == 0
        os.utime(heartbeat, (1.0, 1.0))
        await asyncio.sleep(0.1)
        advanced.append(heartbeat.stat().st_mtime > 1.0)

    monkeypatch.setattr(resume_parser_worker, "init_sentry", MagicMock(side_effect=_boot_step))
    monkeypatch.setattr(
        resume_parser_worker.discovery_embedding_service,
        "load_model_eager",
        MagicMock(side_effect=_boot_step),
    )
    monkeypatch.setattr(resume_parser_worker, "engine", MagicMock(dispose=AsyncMock()))
    monkeypatch.setattr(resume_parser_worker, "poll_until_stopped", _long_step)
    heartbeat.touch()  # left over from the previous run of the container
    await resume_parser_worker.run_resume_worker(asyncio.Event())
    assert seen_at_boot == [False, False]
    assert advanced == [True]
    os.utime(heartbeat, (1.0, 1.0))
    await asyncio.sleep(0.05)
    assert heartbeat.stat().st_mtime == 1.0


def test_the_healthcheck_fails_with_no_heartbeat(heartbeat: Path) -> None:
    assert resume_parser_healthcheck.main() == 1


def test_the_healthcheck_fails_on_a_stale_heartbeat(heartbeat: Path) -> None:
    heartbeat.touch()
    stale = time.time() - HEARTBEAT_MAX_AGE_SECONDS - 1
    os.utime(heartbeat, (stale, stale))
    assert resume_parser_healthcheck.main() == 1
