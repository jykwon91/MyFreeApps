"""A file the database points at but storage no longer has is reported, not a 500.

``read_stored_file`` turns minio's NoSuchKey into ``StoredFileMissingError``;
each user-facing path then says which file to re-upload. Other storage errors
still propagate so an outage isn't mistaken for a deleted file.
"""
from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from minio.error import S3Error

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.core.stored_file_constants import (
    MISSING_DOCUMENT_FILE_DETAIL,
    MISSING_TEMPLATE_FILE_DETAIL,
)
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.services.extraction import document_draft_reader
from app.services.extraction.document_draft_reader import UnreadableDocumentError
from app.services.leases import lease_template_placeholder_service
from app.services.storage.stored_file import StoredFileMissingError, read_stored_file


def _s3_error(code: str) -> S3Error:
    return S3Error("_response", code, "message", "", "", "")


def _storage_raising(code: str) -> MagicMock:
    storage = MagicMock()
    storage.download_file.side_effect = _s3_error(code)
    return storage


@asynccontextmanager
async def _fake_uow():
    yield MagicMock()


@pytest.fixture
def client() -> Iterator[TestClient]:
    ctx = RequestContext(
        organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
    )
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[require_write_access] = lambda: ctx
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


class TestReadStoredFile:
    def test_returns_the_bytes(self) -> None:
        storage = MagicMock()
        storage.download_file.return_value = b"content"

        assert read_stored_file(storage, "k") == b"content"

    @pytest.mark.parametrize("code", ["NoSuchKey", "NoSuchObject"])
    def test_a_missing_object_raises_stored_file_missing(self, code: str) -> None:
        with pytest.raises(StoredFileMissingError) as info:
            read_stored_file(_storage_raising(code), "lease-templates/a/b")

        assert info.value.storage_key == "lease-templates/a/b"

    def test_any_other_storage_error_still_propagates(self) -> None:
        with pytest.raises(S3Error):
            read_stored_file(_storage_raising("AccessDenied"), "k")


class TestSuggestPlaceholders:
    @pytest.mark.asyncio
    async def test_service_raises_when_a_template_file_is_gone(self) -> None:
        file_row = SimpleNamespace(storage_key="lease-templates/t/1", content_type="text/plain")
        with (
            patch.object(lease_template_placeholder_service, "get_storage", return_value=_storage_raising("NoSuchKey")),
            patch.object(lease_template_placeholder_service, "unit_of_work", _fake_uow),
            patch.object(lease_template_placeholder_service.lease_template_repo, "get", new=AsyncMock(return_value=MagicMock())),
            patch.object(
                lease_template_placeholder_service.lease_template_file_repo,
                "list_for_template",
                new=AsyncMock(return_value=[file_row]),
            ),
            patch.object(lease_template_placeholder_service, "_ai_suggest_placeholders", new=AsyncMock()) as ai,
        ):
            with pytest.raises(StoredFileMissingError):
                await lease_template_placeholder_service.suggest_ai_placeholders(
                    user_id=uuid.uuid4(), organization_id=uuid.uuid4(), template_id=uuid.uuid4(),
                )
        ai.assert_not_awaited()

    def test_route_answers_409_with_what_to_do(self, client: TestClient) -> None:
        with patch(
            "app.api.lease_templates.lease_template_service.suggest_ai_placeholders",
            new=AsyncMock(side_effect=StoredFileMissingError("k")),
        ):
            resp = client.post(f"/lease-templates/{uuid.uuid4()}/suggest-placeholders")

        assert resp.status_code == 409
        assert resp.json()["detail"] == MISSING_TEMPLATE_FILE_DETAIL


def test_generating_a_lease_from_a_template_missing_a_file_answers_409(client: TestClient) -> None:
    with patch(
        "app.api.signed_leases.signed_lease_service.generate_lease",
        new=AsyncMock(side_effect=StoredFileMissingError("k")),
    ):
        resp = client.post(
            f"/signed-leases/{uuid.uuid4()}/generate",
            json={"today": dt.date.today().isoformat()},
        )

    assert resp.status_code == 409
    assert resp.json()["detail"] == MISSING_TEMPLATE_FILE_DETAIL


def test_downloading_a_document_whose_file_is_gone_answers_404(client: TestClient) -> None:
    with patch(
        "app.api.documents.document_query_service.get_document_download",
        new=AsyncMock(side_effect=StoredFileMissingError("k")),
    ):
        resp = client.get(f"/documents/{uuid.uuid4()}/download")

    assert resp.status_code == 404
    assert resp.json()["detail"] == MISSING_DOCUMENT_FILE_DETAIL


@pytest.mark.asyncio
async def test_reading_a_document_whose_file_is_gone_is_unreadable() -> None:
    doc = SimpleNamespace(file_storage_key="documents/x", file_content=None, file_type="pdf", file_mime_type="application/pdf")
    with (
        patch.object(document_draft_reader, "get_storage", return_value=_storage_raising("NoSuchKey")),
        patch.object(document_draft_reader, "unit_of_work", _fake_uow),
        patch.object(document_draft_reader.document_repo, "get_by_id_with_content", new=AsyncMock(return_value=doc)),
    ):
        with pytest.raises(UnreadableDocumentError, match="couldn't find this document's file"):
            await document_draft_reader.load_document(
                document_id=uuid.uuid4(), organization_id=uuid.uuid4(),
            )
