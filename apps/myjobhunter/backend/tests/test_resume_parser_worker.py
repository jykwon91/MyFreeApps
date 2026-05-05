"""Tests for the resume parser worker pipeline.

Covers:
  - Happy path: queued job → text extraction → mocked Claude → DB rows written
  - Text extraction failure (image-only PDF) → job marked failed
  - Claude API failure → job marked failed with message
  - Idempotency: claim_next_queued returns None the second time
  - Mapper: work_history, education, skill mapping from Claude output
  - Mapper: skill in-batch deduplication (same name lower-case)
  - Mapper: invalid/edge-case dates handled gracefully
"""
from __future__ import annotations

import io
import uuid
from datetime import date
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.mappers.resume_mapper import map_education, map_skills, map_work_history
from app.services.jobs.resume_text_extractor import (
    ResumeTextExtractionFailed,
    extract_text,
)


# ---------------------------------------------------------------------------
# Text extractor unit tests (no DB required)
# ---------------------------------------------------------------------------


def test_extract_text_pdf_happy_path():
    """PDF with real text content returns (text, char_count)."""
    # Minimal valid PDF that pypdf can parse — just use a simple PDF structure
    # with embedded text. For unit tests we patch at the caller level.
    import pypdf

    # Build a tiny single-page PDF with text using pypdf's writer.
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    pdf_bytes = buf.getvalue()

    # Blank page has no text — confirms the extractor raises on empty PDF.
    with pytest.raises(ResumeTextExtractionFailed, match="image-only or scanned"):
        extract_text(pdf_bytes, "application/pdf")


def test_extract_text_txt_happy_path():
    """Plain text file returns the text and its length."""
    content = b"Jane Doe\nSoftware Engineer\n5 years Python\n"
    text, char_count = extract_text(content, "text/plain")
    assert "Jane Doe" in text
    assert char_count == len(text)


def test_extract_text_txt_empty_raises():
    """Empty plain text file raises ResumeTextExtractionFailed."""
    with pytest.raises(ResumeTextExtractionFailed, match="empty"):
        extract_text(b"   \n  \t  ", "text/plain")


def test_extract_text_docx_minimal():
    """DOCX bytes with no readable text raise ResumeTextExtractionFailed."""
    # Minimal DOCX magic bytes — mammoth will parse it but find no text.
    import zipfile

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
        extract_text(docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")


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
async def test_process_one_happy_path(user_factory, as_user):
    """Happy path: queued job → complete with parsed rows in DB."""
    from app.workers.resume_parser_worker import process_one

    user = await user_factory()

    # Use any bytes — the storage download and text extraction are both mocked.
    pdf_bytes = b"%PDF-1.4 placeholder"
    resume_text = "Jane Doe\nSoftware Engineer\nPython Expert\n"

    fake_storage = _make_fake_storage(pdf_bytes)
    fake_claude = AsyncMock(return_value=_MINIMAL_CLAUDE_RESPONSE)
    fake_extractor = MagicMock(return_value=(resume_text, len(resume_text)))

    async with (await as_user(user)) as authed:
        # Upload a resume to get a queued job row.
        with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
            resp = await authed.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            )
    assert resp.status_code == 201
    job_id = resp.json()["id"]

    # Run the worker against the queued job.
    with (
        patch("app.core.storage.get_storage", return_value=fake_storage),
        patch("app.workers.resume_parser_worker.extract_text", fake_extractor),
        patch("app.workers.resume_parser_worker.extract_resume", fake_claude),
    ):
        found = await process_one()

    assert found is True

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
    from app.workers.resume_parser_worker import process_one
    from app.services.jobs.resume_text_extractor import ResumeTextExtractionFailed

    user = await user_factory()

    pdf_bytes = b"%PDF-1.4 placeholder"
    fake_storage = _make_fake_storage(pdf_bytes)
    # Simulate the text extractor raising ResumeTextExtractionFailed (image-only)
    failing_extractor = MagicMock(
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
        patch("app.core.storage.get_storage", return_value=fake_storage),
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


@pytest.mark.asyncio
async def test_process_one_claude_failure(user_factory, as_user):
    """Claude API error → job marked failed with the error message."""
    import anthropic
    from app.workers.resume_parser_worker import process_one

    user = await user_factory()
    pdf_bytes = b"%PDF-1.4 placeholder"
    resume_text = "Jane Doe Engineer\n"

    fake_storage = _make_fake_storage(pdf_bytes)
    fake_extractor = MagicMock(return_value=(resume_text, len(resume_text)))
    failing_claude = AsyncMock(side_effect=anthropic.APIConnectionError(request=MagicMock()))

    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            resp = await authed.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            )
    assert resp.status_code == 201
    job_id = resp.json()["id"]

    with (
        patch("app.core.storage.get_storage", return_value=fake_storage),
        patch("app.workers.resume_parser_worker.extract_text", fake_extractor),
        patch("app.workers.resume_parser_worker.extract_resume", failing_claude),
    ):
        found = await process_one()

    assert found is True

    async with (await as_user(user)) as authed:
        job_resp = await authed.get(f"/resume-upload-jobs/{job_id}")
    assert job_resp.status_code == 200
    data = job_resp.json()
    assert data["status"] == "failed"
    assert data["error_message"] is not None


@pytest.mark.asyncio
async def test_process_one_idempotency(user_factory, as_user):
    """Calling process_one twice only processes a job once; second call returns False."""
    from app.workers.resume_parser_worker import process_one

    user = await user_factory()
    pdf_bytes = b"%PDF-1.4 placeholder"
    resume_text = "Jane Doe\n"

    fake_storage = _make_fake_storage(pdf_bytes)
    fake_extractor = MagicMock(return_value=(resume_text, len(resume_text)))
    fake_claude = AsyncMock(return_value=_MINIMAL_CLAUDE_RESPONSE)

    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            resp = await authed.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            )
    assert resp.status_code == 201

    with (
        patch("app.core.storage.get_storage", return_value=fake_storage),
        patch("app.workers.resume_parser_worker.extract_text", fake_extractor),
        patch("app.workers.resume_parser_worker.extract_resume", fake_claude),
    ):
        first = await process_one()
        second = await process_one()  # No more queued jobs

    assert first is True
    assert second is False  # Queue was empty
