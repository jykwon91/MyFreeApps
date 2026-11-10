"""HTTP status mapping for lease-template uploads and file replacement."""
from __future__ import annotations

import datetime as _dt
import uuid
from io import BytesIO
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.lease_template_constants import MAX_LEASE_TEMPLATE_FILES, STORAGE_UNAVAILABLE_MESSAGE
from app.core.permissions import require_write_access
from app.core.stored_file_constants import MISSING_TEMPLATE_FILE_DETAIL
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.repositories.leases.template_write_conflict_error import TemplateWriteConflictError
from app.services.leases.lease_template_service import (
    TemplateFileTooLargeError,
    TemplateFileTypeRejectedError,
    TemplateFileUnreadableError,
    TemplateNoFilesError,
    TemplateStorageUnavailableError,
    TemplateTooManyFilesError,
)
from app.services.storage.stored_file import StoredFileMissingError

UPLOAD = "app.api.lease_templates.lease_template_upload_service"
FILE = ("files", ("a.md", BytesIO(b"x"), "text/markdown"))


@pytest.fixture
def client():
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    app.dependency_overrides[require_write_access] = lambda: ctx
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()


def _post_create(client: TestClient):
    return client.post("/lease-templates", data={"name": "T"}, files=[FILE])


def _post_replace(client: TestClient):
    return client.post(f"/lease-templates/{uuid.uuid4()}/files", files=[FILE])


CASES = [
    (TemplateFileTooLargeError("too big"), 413),
    (TemplateTooManyFilesError("too many"), 413),
    (TemplateFileTypeRejectedError("bad type"), 415),
    (TemplateFileUnreadableError("bad.docx could not be read"), 422),
    (TemplateNoFilesError("no files"), 422),
    (TemplateStorageUnavailableError(STORAGE_UNAVAILABLE_MESSAGE), 503),
    (TemplateWriteConflictError("changed by another request"), 409),
]


@pytest.mark.parametrize(("error", "status"), CASES)
def test_create_maps_service_errors(client: TestClient, error: Exception, status: int) -> None:
    with patch(f"{UPLOAD}.upload_template", side_effect=error):
        resp = _post_create(client)

    assert resp.status_code == status
    assert resp.json()["detail"] == str(error)


@pytest.mark.parametrize(("error", "status"), CASES)
def test_replace_maps_service_errors(client: TestClient, error: Exception, status: int) -> None:
    with patch(f"{UPLOAD}.replace_template_files", side_effect=error):
        resp = _post_replace(client)

    assert resp.status_code == status
    assert resp.json()["detail"] == str(error)


def test_too_many_files_is_rejected_before_the_service_runs(client: TestClient) -> None:
    files = [("files", (f"f{i}.md", BytesIO(b"x"), "text/markdown")) for i in range(MAX_LEASE_TEMPLATE_FILES + 1)]

    with patch(f"{UPLOAD}.upload_template") as upload:
        resp = client.post("/lease-templates", data={"name": "T"}, files=files)

    assert resp.status_code == 413
    upload.assert_not_called()


def test_oversized_declared_file_is_rejected_before_it_is_read(client: TestClient) -> None:
    big = ("files", ("big.md", BytesIO(b"x" * 10), "text/markdown"))

    with (
        patch("app.services.leases.lease_template_upload_service.settings.max_lease_template_file_size_bytes", 5),
        patch(f"{UPLOAD}.upload_template") as upload,
        patch("starlette.datastructures.UploadFile.read") as read,
    ):
        resp = client.post("/lease-templates", data={"name": "T"}, files=[big])

    assert resp.status_code == 413
    read.assert_not_called()
    upload.assert_not_called()


def test_request_without_files_is_422(client: TestClient) -> None:
    with patch(f"{UPLOAD}.upload_template") as upload:
        resp = client.post("/lease-templates", data={"name": "T"})

    assert resp.status_code == 422
    upload.assert_not_called()


def test_add_templates_to_lease_maps_missing_template_object_to_409(client: TestClient) -> None:
    with patch(
        "app.api.signed_leases.signed_lease_service.add_templates_and_generate",
        side_effect=StoredFileMissingError("lease-templates/t/f"),
    ):
        resp = client.post(
            f"/signed-leases/{uuid.uuid4()}/templates",
            json={"template_ids": [str(uuid.uuid4())], "today": _dt.datetime.now(_dt.timezone.utc).date().isoformat()},
        )

    assert resp.status_code == 409
    assert resp.json()["detail"] == MISSING_TEMPLATE_FILE_DETAIL
