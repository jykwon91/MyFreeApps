"""Over-long document fields return 422, not a database 500.

``documents.title`` and ``documents.filename`` are ``String(255)`` columns.
Before the length bounds existed, a longer value passed validation and failed
at the database as a 500. A value exactly at the limit must still be accepted.
An unknown ``kind`` on the multipart upload hit the same path (CHECK
constraint) and is covered here too.
"""
from __future__ import annotations

import io
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.core.document_limits import DOCUMENT_FILENAME_MAX_LEN, DOCUMENT_TITLE_MAX_LEN

_PDF_BYTES = b"%PDF-1.4 " + b"A" * 200
_AT_LIMIT_TITLE = "t" * DOCUMENT_TITLE_MAX_LEN
_TOO_LONG_TITLE = "t" * (DOCUMENT_TITLE_MAX_LEN + 1)


def _fake_storage() -> MagicMock:
    storage = MagicMock()
    storage.generate_key.return_value = f"documents/fake-{uuid.uuid4().hex}/file.pdf"
    storage.upload_file.return_value = storage.generate_key.return_value
    return storage


async def _post_text(authed, title: str):
    return await authed.post(
        "/documents", json={"title": title, "kind": "other", "body": "some text"},
    )


async def _post_upload(authed, *, title: str = "Resume", kind: str = "other", filename: str = "resume.pdf"):
    with patch(
        "app.services.documents.document_service.get_storage", return_value=_fake_storage(),
    ):
        return await authed.post(
            "/documents/upload",
            data={"title": title, "kind": kind},
            files={"file": (filename, io.BytesIO(_PDF_BYTES), "application/pdf")},
        )


@pytest.mark.asyncio
async def test_create_text_document_title_at_limit_accepted(user_factory, as_user):
    user = await user_factory()
    async with (await as_user(user)) as authed:
        resp = await _post_text(authed, _AT_LIMIT_TITLE)
    assert resp.status_code == 201, resp.text
    assert resp.json()["title"] == _AT_LIMIT_TITLE


@pytest.mark.asyncio
async def test_create_text_document_title_too_long_returns_422(user_factory, as_user):
    user = await user_factory()
    async with (await as_user(user)) as authed:
        resp = await _post_text(authed, _TOO_LONG_TITLE)
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_update_document_title_at_limit_accepted(user_factory, as_user):
    user = await user_factory()
    async with (await as_user(user)) as authed:
        doc_id = (await _post_text(authed, "Original")).json()["id"]
        resp = await authed.patch(f"/documents/{doc_id}", json={"title": _AT_LIMIT_TITLE})
    assert resp.status_code == 200, resp.text
    assert resp.json()["title"] == _AT_LIMIT_TITLE


@pytest.mark.asyncio
async def test_update_document_title_too_long_returns_422(user_factory, as_user):
    user = await user_factory()
    async with (await as_user(user)) as authed:
        doc_id = (await _post_text(authed, "Original")).json()["id"]
        resp = await authed.patch(f"/documents/{doc_id}", json={"title": _TOO_LONG_TITLE})
        unchanged = await authed.get(f"/documents/{doc_id}")
    assert resp.status_code == 422, resp.text
    assert unchanged.json()["title"] == "Original"


@pytest.mark.asyncio
async def test_upload_title_at_limit_accepted(user_factory, as_user):
    user = await user_factory()
    async with (await as_user(user)) as authed:
        resp = await _post_upload(authed, title=_AT_LIMIT_TITLE)
    assert resp.status_code == 201, resp.text
    assert resp.json()["title"] == _AT_LIMIT_TITLE


@pytest.mark.asyncio
async def test_upload_title_too_long_returns_422(user_factory, as_user):
    user = await user_factory()
    async with (await as_user(user)) as authed:
        resp = await _post_upload(authed, title=_TOO_LONG_TITLE)
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_upload_filename_at_limit_accepted(user_factory, as_user):
    user = await user_factory()
    filename = "f" * (DOCUMENT_FILENAME_MAX_LEN - len(".pdf")) + ".pdf"
    async with (await as_user(user)) as authed:
        resp = await _post_upload(authed, filename=filename)
    assert resp.status_code == 201, resp.text
    assert resp.json()["filename"] == filename


@pytest.mark.asyncio
async def test_upload_filename_too_long_returns_422(user_factory, as_user):
    user = await user_factory()
    filename = "f" * DOCUMENT_FILENAME_MAX_LEN + ".pdf"
    async with (await as_user(user)) as authed:
        resp = await _post_upload(authed, filename=filename)
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_upload_unknown_kind_returns_422(user_factory, as_user):
    user = await user_factory()
    async with (await as_user(user)) as authed:
        resp = await _post_upload(authed, kind="not_a_real_kind")
    assert resp.status_code == 422, resp.text
