"""Unit tests for the resume upload service and validator.

Covers:
  - Happy path: PDF upload succeeds (validated, MinIO key written, job created)
  - Oversize rejection: file > max_bytes raises ResumeRejected (HTTP 413)
  - Wrong content-type rejection: non-resume type raises ResumeRejected (HTTP 415)
  - Magic-byte mismatch: PDF declared but ZIP bytes raises ResumeRejected (HTTP 415)
  - Tenant isolation: one user cannot read another user's jobs

MinIO is mocked so these tests run without a real MinIO instance.
"""
from __future__ import annotations

import io
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.services.jobs.resume_validator import (
    ALLOWED_RESUME_MIME_TYPES,
    ResumeRejected,
    sniff_content_type,
    validate_resume,
)

# ---------------------------------------------------------------------------
# sniff_content_type — pure function, no DB/IO needed
# ---------------------------------------------------------------------------


def test_sniff_pdf():
    content = b"%PDF-1.4 fake pdf content"
    assert sniff_content_type(content) == "application/pdf"


def test_sniff_docx():
    # DOCX starts with ZIP magic bytes PK\x03\x04
    content = b"PK\x03\x04" + b"\x00" * 100
    assert sniff_content_type(content) == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


def test_sniff_plain_text():
    content = b"This is a plain text resume with skills and experience."
    assert sniff_content_type(content) == "text/plain"


def test_sniff_unknown_binary():
    content = b"\x00\x01\x02\x03\xff\xfe\xfd" * 20
    assert sniff_content_type(content) is None


def test_sniff_too_short():
    assert sniff_content_type(b"PDF") is None


# ---------------------------------------------------------------------------
# validate_resume — validates size + type
# ---------------------------------------------------------------------------

_PDF_BYTES = b"%PDF-1.4 " + b"A" * 100
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB for tests


def test_validate_resume_pdf_happy_path():
    result = validate_resume(_PDF_BYTES, "application/pdf", _MAX_BYTES)
    assert result == "application/pdf"


def test_validate_resume_docx_happy_path():
    docx_bytes = b"PK\x03\x04" + b"\x00" * 100
    result = validate_resume(
        docx_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        _MAX_BYTES,
    )
    assert result == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def test_validate_resume_text_happy_path():
    text_bytes = b"Name: Jane Doe\nExperience: 5 years Python"
    result = validate_resume(text_bytes, "text/plain", _MAX_BYTES)
    assert result == "text/plain"


def test_validate_resume_oversize_raises():
    big_file = b"%PDF-1.4 " + b"A" * (5 * 1024 * 1024)  # 5 MB > 1 MB limit
    with pytest.raises(ResumeRejected) as exc_info:
        validate_resume(big_file, "application/pdf", 1 * 1024 * 1024)
    assert "exceeds" in str(exc_info.value).lower()


def test_validate_resume_empty_raises():
    with pytest.raises(ResumeRejected) as exc_info:
        validate_resume(b"", "application/pdf", _MAX_BYTES)
    assert "empty" in str(exc_info.value).lower()


def test_validate_resume_unknown_type_raises():
    # GIF magic bytes — not in allowlist
    gif_bytes = b"GIF89a" + b"\x00" * 100
    with pytest.raises(ResumeRejected) as exc_info:
        validate_resume(gif_bytes, "image/gif", _MAX_BYTES)
    assert "unsupported" in str(exc_info.value).lower()


def test_validate_resume_magic_byte_mismatch_raises():
    # Client declares PDF but sends ZIP (DOCX) bytes
    docx_bytes = b"PK\x03\x04" + b"\x00" * 100
    with pytest.raises(ResumeRejected) as exc_info:
        validate_resume(docx_bytes, "application/pdf", _MAX_BYTES)
    assert "does not match" in str(exc_info.value).lower()


# ---------------------------------------------------------------------------
# HTTP-layer integration tests: POST /resumes + GET /resume-upload-jobs
# ---------------------------------------------------------------------------


def _make_fake_storage():
    """Return a MagicMock that acts like StorageClient for upload tests."""
    storage = MagicMock()
    storage.generate_key.return_value = "resumes/fake-uuid/resume.pdf"
    storage.upload_file.return_value = "resumes/fake-uuid/resume.pdf"
    storage.generate_presigned_url.return_value = "https://example.com/presigned/resume.pdf"
    return storage


@pytest.mark.asyncio
async def test_upload_resume_happy_path(user_factory, as_user):
    """POST /resumes with a valid PDF returns 201 with status='queued'."""
    user = await user_factory()
    fake_storage = _make_fake_storage()

    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            pdf_content = b"%PDF-1.4 test resume content"
            resp = await authed.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(pdf_content), "application/pdf")},
            )

    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["status"] == "queued"
    assert data["file_filename"] == "resume.pdf"
    assert data["file_content_type"] == "application/pdf"
    assert data["file_size_bytes"] == len(pdf_content)
    assert "id" in data
    # Raw MinIO key must NOT be in the response
    assert "file_path" not in data


@pytest.mark.asyncio
async def test_upload_resume_oversize_returns_413(user_factory, as_user, monkeypatch):
    """POST /resumes with a file exceeding max size returns 413."""
    user = await user_factory()
    # Override the max to 10 bytes so any real file triggers the limit
    monkeypatch.setattr(
        "app.core.config.settings.max_resume_upload_bytes", 10
    )
    fake_storage = _make_fake_storage()

    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            pdf_content = b"%PDF-1.4 content that is more than 10 bytes"
            resp = await authed.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(pdf_content), "application/pdf")},
            )

    assert resp.status_code == 413, resp.text


@pytest.mark.asyncio
async def test_upload_resume_wrong_content_type_returns_415(user_factory, as_user):
    """POST /resumes with an image file returns 415."""
    user = await user_factory()
    fake_storage = _make_fake_storage()

    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            # GIF magic bytes — not allowed
            gif_content = b"GIF89a" + b"\x00" * 100
            resp = await authed.post(
                "/resumes",
                files={"file": ("photo.gif", io.BytesIO(gif_content), "image/gif")},
            )

    assert resp.status_code == 415, resp.text


@pytest.mark.asyncio
async def test_upload_resume_magic_byte_mismatch_returns_415(user_factory, as_user):
    """POST /resumes with DOCX bytes declared as PDF returns 415."""
    user = await user_factory()
    fake_storage = _make_fake_storage()

    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            docx_bytes = b"PK\x03\x04" + b"\x00" * 100
            resp = await authed.post(
                "/resumes",
                files={
                    "file": (
                        "resume.pdf",
                        io.BytesIO(docx_bytes),
                        "application/pdf",
                    )
                },
            )

    assert resp.status_code == 415, resp.text


@pytest.mark.asyncio
async def test_tenant_isolation_get_job(user_factory, as_user):
    """User A cannot read User B's resume upload job by guessing its ID."""
    user_a = await user_factory()
    user_b = await user_factory()
    fake_storage = _make_fake_storage()

    # User A uploads a resume
    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user_a)) as authed_a:
            pdf_content = b"%PDF-1.4 test"
            resp = await authed_a.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(pdf_content), "application/pdf")},
            )
    assert resp.status_code == 201
    job_id = resp.json()["id"]

    # User B tries to access User A's job — must get 404
    async with (await as_user(user_b)) as authed_b:
        resp_b = await authed_b.get(f"/resume-upload-jobs/{job_id}")
    assert resp_b.status_code == 404


@pytest.mark.asyncio
async def test_list_resume_jobs_scoped_to_user(user_factory, as_user):
    """GET /resume-upload-jobs only returns the authenticated user's jobs."""
    user_a = await user_factory()
    user_b = await user_factory()
    fake_storage = _make_fake_storage()

    # User A uploads a resume
    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=fake_storage):
        async with (await as_user(user_a)) as authed_a:
            pdf_content = b"%PDF-1.4 test"
            await authed_a.post(
                "/resumes",
                files={"file": ("resume.pdf", io.BytesIO(pdf_content), "application/pdf")},
            )

    # User B's list should be empty
    async with (await as_user(user_b)) as authed_b:
        resp_b = await authed_b.get("/resume-upload-jobs")
    assert resp_b.status_code == 200
    assert resp_b.json() == []


@pytest.mark.asyncio
async def test_download_url_requires_auth(client):
    """GET /resume-upload-jobs/{id}/download without auth returns 401."""
    resp = await client.get(f"/resume-upload-jobs/{uuid.uuid4()}/download")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_upload_requires_auth(client):
    """POST /resumes without auth returns 401."""
    pdf_content = b"%PDF-1.4 test"
    resp = await client.post(
        "/resumes",
        files={"file": ("resume.pdf", io.BytesIO(pdf_content), "application/pdf")},
    )
    assert resp.status_code == 401
