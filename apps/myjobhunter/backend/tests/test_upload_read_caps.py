"""Resume and document uploads stop reading a file once it passes the size limit.

Before, both endpoints read the whole upload into memory (``await file.read()``)
and only then compared its length with the limit, so one huge file could exhaust
the server's memory. Each still answers 413 with the same message as before.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from platform_shared.core.capped_upload_constants import UPLOAD_READ_CHUNK_BYTES
from starlette.datastructures import UploadFile

from app.core.config import settings

_MB = 1024 * 1024

# (path, form fields, settings limit, service the route hands the bytes to)
_ENDPOINTS = [
    pytest.param(
        "/resumes", {}, "max_resume_upload_bytes", "app.api.resumes.create_upload",
        id="resume-upload",
    ),
    pytest.param(
        "/documents/upload", {"title": "Cover letter", "kind": "other"},
        "max_document_upload_bytes",
        "app.api.documents.document_service.create_file_document",
        id="document-upload",
    ),
]


class _ServiceReached(Exception):
    """Raised by the mocked service, so a test sees exactly what reached it."""


@pytest.mark.asyncio
@pytest.mark.parametrize(("path", "form", "limit_setting", "service_path"), _ENDPOINTS)
async def test_oversized_upload_is_refused_without_reading_it_all(
    path: str,
    form: dict[str, str],
    limit_setting: str,
    service_path: str,
    user_factory,
    as_user,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    limit = 1 * _MB
    monkeypatch.setattr(settings, limit_setting, limit)
    asked: list[int] = []
    returned: list[int] = []
    original_read = UploadFile.read

    async def recording_read(self: UploadFile, size: int = -1) -> bytes:
        asked.append(size)
        chunk = await original_read(self, size)
        returned.append(len(chunk))
        return chunk

    monkeypatch.setattr(UploadFile, "read", recording_read)
    service = AsyncMock(side_effect=_ServiceReached)
    user = await user_factory()

    with patch(service_path, new=service):
        async with await as_user(user) as authed:
            resp = await authed.post(
                path, data=form,
                files={"file": ("big.pdf", b"%PDF" + b"\0" * (limit * 4), "application/pdf")},
            )

    assert resp.status_code == 413, resp.text
    assert resp.json()["detail"] == "file exceeds 1MB limit"
    assert asked and all(size > 0 for size in asked)  # never "read everything"
    assert sum(returned) <= limit + UPLOAD_READ_CHUNK_BYTES
    service.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(("path", "form", "limit_setting", "service_path"), _ENDPOINTS)
async def test_upload_under_the_limit_reaches_the_service_whole(
    path: str,
    form: dict[str, str],
    limit_setting: str,
    service_path: str,
    user_factory,
    as_user,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A file spanning several read chunks arrives byte for byte."""
    monkeypatch.setattr(settings, limit_setting, 3 * _MB)
    content = b"%PDF" + bytes(range(256)) * (5 * _MB // 2 // 256)
    service = AsyncMock(side_effect=_ServiceReached)
    user = await user_factory()

    with patch(service_path, new=service), pytest.raises(_ServiceReached):
        async with await as_user(user) as authed:
            await authed.post(
                path, data=form, files={"file": ("cv.pdf", content, "application/pdf")},
            )

    assert service.call_args.kwargs["file_bytes"] == content
