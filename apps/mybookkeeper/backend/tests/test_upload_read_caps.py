"""Every upload endpoint stops reading a file once it passes the endpoint's size limit.

Before, each endpoint read the whole upload into memory (``await file.read()``)
and only then compared its length with the limit, so one huge file could exhaust
the server's memory. Each case answers the same status and message as before.
"""
from __future__ import annotations

import io
import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from platform_shared.core.capped_upload_constants import UPLOAD_READ_CHUNK_BYTES
from starlette.datastructures import UploadFile as StarletteUploadFile

from app.api.lease_templates import _read_upload_files
from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from tests.upload_cap_case import UploadCapCase
from tests.upload_cap_cases import (
    DECLARED_SIZE_CASES,
    READ_CAPPED_CASES,
    UPLOAD_CAP_CASES,
)

_MB = 1024 * 1024


class _ServiceReached(Exception):
    """Raised by the mocked service, so a test sees exactly what reached it."""


@pytest.fixture(autouse=True)
def _write_access() -> Iterator[None]:
    app.dependency_overrides[require_write_access] = lambda: RequestContext(
        organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
    )
    yield
    app.dependency_overrides.clear()


@pytest.fixture()
def recorded_reads(monkeypatch: pytest.MonkeyPatch) -> tuple[list[int], list[int]]:
    """Record the size asked for and the bytes returned by every ``UploadFile.read``."""
    asked: list[int] = []
    returned: list[int] = []
    original_read = StarletteUploadFile.read

    async def recording_read(self: StarletteUploadFile, size: int = -1) -> bytes:
        asked.append(size)
        chunk = await original_read(self, size)
        returned.append(len(chunk))
        return chunk

    monkeypatch.setattr(StarletteUploadFile, "read", recording_read)
    return asked, returned


def _send(case: UploadCapCase, content: bytes):
    client = TestClient(app)
    return client.request(
        case.method,
        case.path,
        data=case.form,
        files=[(case.file_field, (case.filename, content, "application/octet-stream"))],
    )


@pytest.mark.parametrize("case", READ_CAPPED_CASES, ids=lambda c: c.id)
def test_oversized_upload_is_refused_without_reading_it_all(
    case: UploadCapCase,
    monkeypatch: pytest.MonkeyPatch,
    recorded_reads: tuple[list[int], list[int]],
) -> None:
    limit = 1 * _MB
    case.set_limit(monkeypatch, limit)
    service = AsyncMock(side_effect=_ServiceReached)
    asked, returned = recorded_reads

    with patch(case.service, new=service):
        resp = _send(case, b"\0" * (limit * 4))

    assert resp.status_code == case.too_large_status, resp.text
    assert resp.json()["detail"] == case.too_large_detail(limit)
    assert asked and all(size > 0 for size in asked)  # read in chunks, never "read everything"
    assert sum(returned) <= limit + UPLOAD_READ_CHUNK_BYTES
    service.assert_not_called()


@pytest.mark.parametrize("case", DECLARED_SIZE_CASES, ids=lambda c: c.id)
def test_oversized_upload_is_refused_by_its_declared_size_before_any_read(
    case: UploadCapCase,
    monkeypatch: pytest.MonkeyPatch,
    recorded_reads: tuple[list[int], list[int]],
) -> None:
    limit = 1 * _MB
    case.set_limit(monkeypatch, limit)
    service = AsyncMock(side_effect=_ServiceReached)
    asked, _ = recorded_reads

    with patch(case.service, new=service):
        resp = _send(case, b"\0" * (limit * 4))

    assert resp.status_code == case.too_large_status, resp.text
    assert resp.json()["detail"] == case.too_large_detail(limit)
    assert asked == []
    service.assert_not_called()


@pytest.mark.parametrize("case", UPLOAD_CAP_CASES, ids=lambda c: c.id)
def test_upload_under_the_limit_reaches_the_service_whole(
    case: UploadCapCase, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A file spanning several read chunks arrives byte for byte."""
    case.set_limit(monkeypatch, 3 * _MB)
    content = bytes(range(256)) * (5 * _MB // 2 // 256)
    service = AsyncMock(side_effect=_ServiceReached)

    with patch(case.service, new=service), pytest.raises(_ServiceReached):
        _send(case, content)

    args, kwargs = service.call_args
    assert case.received(args, kwargs) == content


class _CountingFile(io.BytesIO):
    """A file that records how many bytes the reader actually pulled from it."""

    def __init__(self, data: bytes) -> None:
        super().__init__(data)
        self.bytes_read = 0

    def read(self, size: int | None = -1) -> bytes:
        chunk = super().read(size)
        self.bytes_read += len(chunk)
        return chunk


async def test_lease_template_file_without_a_declared_size_is_still_capped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The declared-size check can't help when the size is unknown; the read itself stops."""
    limit = 1 * _MB
    monkeypatch.setattr("app.api.lease_templates.settings.max_lease_template_file_size_bytes", limit)
    raw = _CountingFile(b"\0" * (limit * 4))
    upload = UploadFile(file=raw, filename="lease.docx", size=None)

    with pytest.raises(HTTPException) as exc_info:
        await _read_upload_files([upload])

    assert exc_info.value.status_code == 413
    assert exc_info.value.detail == "lease.docx exceeds 1MB limit"
    assert raw.bytes_read <= limit + UPLOAD_READ_CHUNK_BYTES
