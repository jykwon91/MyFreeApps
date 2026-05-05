"""Tests for the Documents domain.

Covers:
  - Happy path: text document create + read + list + update + delete
  - Happy path: file upload via POST /documents/upload (mocked MinIO)
  - Kind enum validation: unsupported kind raises 422
  - Tenant isolation: user A cannot get/list/update/delete user B's documents
  - Soft-delete semantics: deleted docs excluded from list by default
  - Oversize file upload: 413
  - Wrong content-type: 415

MinIO is mocked so these tests run without a real MinIO instance.
"""
from __future__ import annotations

import io
import uuid
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PDF_BYTES = b"%PDF-1.4 " + b"A" * 200


def _make_fake_storage() -> MagicMock:
    """Return a MagicMock that looks like the StorageClient for document tests."""
    storage = MagicMock()
    storage.generate_key.return_value = f"documents/fake-{uuid.uuid4().hex}/file.pdf"
    storage.upload_file.return_value = storage.generate_key.return_value
    storage.generate_presigned_url.return_value = "https://example.com/presigned/doc.pdf"
    storage.delete_file.return_value = None
    return storage


async def _create_text_doc(
    authed: AsyncClient,
    title: str = "My Cover Letter",
    kind: str = "cover_letter",
    body: str = "This is my cover letter body.",
    application_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"title": title, "kind": kind, "body": body}
    if application_id is not None:
        payload["application_id"] = application_id
    resp = await authed.post("/documents", json=payload)
    return resp


# ---------------------------------------------------------------------------
# Text document — happy path CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_text_document(user_factory, as_user):
    """POST /documents with JSON body returns 201 with correct fields."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        resp = await _create_text_doc(authed)

    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["title"] == "My Cover Letter"
    assert data["kind"] == "cover_letter"
    assert data["body"] == "This is my cover letter body."
    assert data["has_file"] is False
    assert data["file_path"] is None if "file_path" in data else True  # file_path not in response
    assert "id" in data
    assert "user_id" in data
    assert data["deleted_at"] is None


@pytest.mark.asyncio
async def test_get_document(user_factory, as_user):
    """GET /documents/{id} returns the document created above."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        create_resp = await _create_text_doc(authed)
        doc_id = create_resp.json()["id"]
        resp = await authed.get(f"/documents/{doc_id}")

    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == doc_id
    assert resp.json()["title"] == "My Cover Letter"


@pytest.mark.asyncio
async def test_list_documents(user_factory, as_user):
    """GET /documents lists all the user's documents."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        await _create_text_doc(authed, title="Doc 1", kind="cover_letter")
        await _create_text_doc(authed, title="Doc 2", kind="other")
        resp = await authed.get("/documents")

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] == 2
    titles = {item["title"] for item in data["items"]}
    assert titles == {"Doc 1", "Doc 2"}


@pytest.mark.asyncio
async def test_update_document(user_factory, as_user):
    """PATCH /documents/{id} partially updates allowed fields."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        doc_id = (await _create_text_doc(authed)).json()["id"]
        resp = await authed.patch(
            f"/documents/{doc_id}",
            json={"title": "Updated Title", "kind": "tailored_resume"},
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["title"] == "Updated Title"
    assert data["kind"] == "tailored_resume"
    # body unchanged
    assert data["body"] == "This is my cover letter body."


@pytest.mark.asyncio
async def test_delete_document_returns_204(user_factory, as_user):
    """DELETE /documents/{id} returns 204."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        doc_id = (await _create_text_doc(authed)).json()["id"]
        resp = await authed.delete(f"/documents/{doc_id}")

    assert resp.status_code == 204, resp.text


@pytest.mark.asyncio
async def test_delete_missing_document_returns_404(user_factory, as_user):
    """DELETE /documents/{random_id} returns 404."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        resp = await authed.delete(f"/documents/{uuid.uuid4()}")

    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Text document — body required validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_text_document_empty_body_returns_422(user_factory, as_user):
    """POST /documents with empty body returns 422."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        resp = await authed.post(
            "/documents",
            json={"title": "Bad", "kind": "other", "body": ""},
        )

    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_create_text_document_missing_body_returns_422(user_factory, as_user):
    """POST /documents with no body field returns 422."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        resp = await authed.post(
            "/documents",
            json={"title": "Bad", "kind": "other"},
        )

    assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# Kind enum validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_document_invalid_kind_returns_422(user_factory, as_user):
    """POST /documents with an unsupported kind returns 422."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        resp = await authed.post(
            "/documents",
            json={"title": "Bad Kind", "kind": "not_a_real_kind", "body": "some text"},
        )

    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_update_document_invalid_kind_returns_422(user_factory, as_user):
    """PATCH /documents/{id} with an unsupported kind returns 422."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        doc_id = (await _create_text_doc(authed)).json()["id"]
        resp = await authed.patch(
            f"/documents/{doc_id}",
            json={"kind": "invalid_kind"},
        )

    assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# File upload — happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_file_document_happy_path(user_factory, as_user):
    """POST /documents/upload with a valid PDF returns 201."""
    user = await user_factory()
    fake_storage = _make_fake_storage()

    with patch("app.services.documents.document_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            resp = await authed.post(
                "/documents/upload",
                data={"title": "My Resume", "kind": "tailored_resume"},
                files={"file": ("resume.pdf", io.BytesIO(_PDF_BYTES), "application/pdf")},
            )

    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["title"] == "My Resume"
    assert data["kind"] == "tailored_resume"
    assert data["has_file"] is True
    assert data["filename"] == "resume.pdf"
    assert data["content_type"] == "application/pdf"
    assert data["size_bytes"] == len(_PDF_BYTES)
    # MinIO key must NOT be in the response
    assert "file_path" not in data or data.get("file_path") is None


@pytest.mark.asyncio
async def test_upload_file_document_oversize_returns_413(user_factory, as_user, monkeypatch):
    """POST /documents/upload with an oversize file returns 413."""
    user = await user_factory()
    # Lower max to 10 bytes so the _PDF_BYTES triggers the limit.
    monkeypatch.setattr(
        "app.services.documents.document_service._MAX_UPLOAD_BYTES", 10
    )
    fake_storage = _make_fake_storage()

    with patch("app.services.documents.document_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            resp = await authed.post(
                "/documents/upload",
                data={"title": "Big File", "kind": "other"},
                files={"file": ("big.pdf", io.BytesIO(_PDF_BYTES), "application/pdf")},
            )

    assert resp.status_code == 413, resp.text


@pytest.mark.asyncio
async def test_upload_file_document_wrong_type_returns_415(user_factory, as_user):
    """POST /documents/upload with a GIF (unsupported type) returns 415."""
    user = await user_factory()
    fake_storage = _make_fake_storage()
    gif_bytes = b"GIF89a" + b"\x00" * 200

    with patch("app.services.documents.document_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            resp = await authed.post(
                "/documents/upload",
                data={"title": "Photo", "kind": "other"},
                files={"file": ("photo.gif", io.BytesIO(gif_bytes), "image/gif")},
            )

    assert resp.status_code == 415, resp.text


@pytest.mark.asyncio
async def test_upload_file_document_magic_byte_mismatch_returns_415(user_factory, as_user):
    """POST /documents/upload with DOCX bytes declared as PDF returns 415."""
    user = await user_factory()
    fake_storage = _make_fake_storage()
    docx_bytes = b"PK\x03\x04" + b"\x00" * 200  # DOCX magic

    with patch("app.services.documents.document_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            resp = await authed.post(
                "/documents/upload",
                data={"title": "Resume", "kind": "tailored_resume"},
                files={"file": ("resume.pdf", io.BytesIO(docx_bytes), "application/pdf")},
            )

    assert resp.status_code == 415, resp.text


# ---------------------------------------------------------------------------
# Presigned download URL
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_download_url_for_file_document(user_factory, as_user):
    """GET /documents/{id}/download returns presigned URL for file-backed document."""
    user = await user_factory()
    fake_storage = _make_fake_storage()

    with patch("app.services.documents.document_service.get_storage", return_value=fake_storage):
        async with (await as_user(user)) as authed:
            create_resp = await authed.post(
                "/documents/upload",
                data={"title": "My Resume", "kind": "tailored_resume"},
                files={"file": ("resume.pdf", io.BytesIO(_PDF_BYTES), "application/pdf")},
            )
            assert create_resp.status_code == 201
            doc_id = create_resp.json()["id"]
            dl_resp = await authed.get(f"/documents/{doc_id}/download")

    assert dl_resp.status_code == 200, dl_resp.text
    assert "url" in dl_resp.json()


@pytest.mark.asyncio
async def test_download_url_for_text_document_returns_404(user_factory, as_user):
    """GET /documents/{id}/download on a text-only document returns 404."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        doc_id = (await _create_text_doc(authed)).json()["id"]
        resp = await authed.get(f"/documents/{doc_id}/download")

    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Soft-delete semantics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_soft_delete_excludes_from_list(user_factory, as_user):
    """Deleted documents do not appear in GET /documents."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        doc1_id = (await _create_text_doc(authed, title="Keep")).json()["id"]
        doc2_id = (await _create_text_doc(authed, title="Delete Me", kind="other")).json()["id"]

        # List before delete — 2 docs.
        before = await authed.get("/documents")
        assert before.json()["total"] == 2

        # Delete doc2.
        await authed.delete(f"/documents/{doc2_id}")

        # List after delete — only 1 doc remains.
        after = await authed.get("/documents")

    assert after.json()["total"] == 1
    assert after.json()["items"][0]["id"] == doc1_id


@pytest.mark.asyncio
async def test_soft_delete_excludes_from_get(user_factory, as_user):
    """GET /documents/{id} on a soft-deleted document returns 404."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        doc_id = (await _create_text_doc(authed)).json()["id"]
        await authed.delete(f"/documents/{doc_id}")
        resp = await authed.get(f"/documents/{doc_id}")

    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_soft_delete_is_idempotent(user_factory, as_user):
    """Deleting the same document twice both return 204."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        doc_id = (await _create_text_doc(authed)).json()["id"]
        resp1 = await authed.delete(f"/documents/{doc_id}")
        # Second delete: document exists but is already deleted — still 204
        # because soft_delete_document fetches include_deleted=True.
        resp2 = await authed.delete(f"/documents/{doc_id}")

    assert resp1.status_code == 204, resp1.text
    assert resp2.status_code == 204, resp2.text


# ---------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tenant_isolation_get(user_factory, as_user):
    """User B cannot read User A's document by guessing its ID."""
    user_a = await user_factory()
    user_b = await user_factory()

    async with (await as_user(user_a)) as authed_a:
        doc_id = (await _create_text_doc(authed_a)).json()["id"]

    async with (await as_user(user_b)) as authed_b:
        resp = await authed_b.get(f"/documents/{doc_id}")

    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_tenant_isolation_list(user_factory, as_user):
    """GET /documents for user B never includes user A's documents."""
    user_a = await user_factory()
    user_b = await user_factory()

    async with (await as_user(user_a)) as authed_a:
        await _create_text_doc(authed_a, title="A's doc")

    async with (await as_user(user_b)) as authed_b:
        resp = await authed_b.get("/documents")

    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_tenant_isolation_update(user_factory, as_user):
    """User B cannot PATCH User A's document."""
    user_a = await user_factory()
    user_b = await user_factory()

    async with (await as_user(user_a)) as authed_a:
        doc_id = (await _create_text_doc(authed_a)).json()["id"]

    async with (await as_user(user_b)) as authed_b:
        resp = await authed_b.patch(
            f"/documents/{doc_id}",
            json={"title": "Hijacked"},
        )

    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_tenant_isolation_delete(user_factory, as_user):
    """User B cannot DELETE User A's document."""
    user_a = await user_factory()
    user_b = await user_factory()

    async with (await as_user(user_a)) as authed_a:
        doc_id = (await _create_text_doc(authed_a)).json()["id"]

    async with (await as_user(user_b)) as authed_b:
        resp = await authed_b.delete(f"/documents/{doc_id}")

    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_tenant_isolation_download(user_factory, as_user):
    """User B cannot get download URL for User A's file document."""
    user_a = await user_factory()
    user_b = await user_factory()
    fake_storage = _make_fake_storage()

    with patch("app.services.documents.document_service.get_storage", return_value=fake_storage):
        async with (await as_user(user_a)) as authed_a:
            create_resp = await authed_a.post(
                "/documents/upload",
                data={"title": "A's Resume", "kind": "tailored_resume"},
                files={"file": ("resume.pdf", io.BytesIO(_PDF_BYTES), "application/pdf")},
            )
        assert create_resp.status_code == 201
        doc_id = create_resp.json()["id"]

    async with (await as_user(user_b)) as authed_b:
        resp = await authed_b.get(f"/documents/{doc_id}/download")

    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Auth gates (unauthenticated requests)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_document_requires_auth(client):
    """POST /documents without auth returns 401."""
    resp = await client.post(
        "/documents",
        json={"title": "Test", "kind": "cover_letter", "body": "some text"},
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_list_documents_requires_auth(client):
    """GET /documents without auth returns 401."""
    resp = await client.get("/documents")
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_upload_document_requires_auth(client):
    """POST /documents/upload without auth returns 401."""
    resp = await client.post(
        "/documents/upload",
        data={"title": "Test", "kind": "other"},
        files={"file": ("f.pdf", io.BytesIO(_PDF_BYTES), "application/pdf")},
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_get_document_requires_auth(client):
    """GET /documents/{id} without auth returns 401."""
    resp = await client.get(f"/documents/{uuid.uuid4()}")
    assert resp.status_code == 401, resp.text


# ---------------------------------------------------------------------------
# List filtering
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_filter_by_kind(user_factory, as_user):
    """GET /documents?kind=cover_letter returns only cover_letter docs."""
    user = await user_factory()
    async with (await as_user(user)) as authed:
        await _create_text_doc(authed, title="CL", kind="cover_letter")
        await _create_text_doc(authed, title="Other", kind="other")
        resp = await authed.get("/documents?kind=cover_letter")

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["kind"] == "cover_letter"
