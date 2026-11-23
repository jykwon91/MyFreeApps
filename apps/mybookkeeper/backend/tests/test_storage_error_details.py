"""Storage 503s send fixed copy, never the exception's own text.

``StorageNotConfiguredError`` names the unset ``MINIO_*`` env vars and the
bucket, which is for the operator; a render-time storage outage wraps a MinIO
error. Every route that maps them keeps its 503 and sends our copy instead.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from collections.abc import Callable, Iterator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from platform_shared.core.storage import StorageNotConfiguredError, build_storage_client
from platform_shared.core.storage_messages import STORAGE_NOT_CONFIGURED_DETAIL

from app.core.context import RequestContext
from app.core.lease_template_constants import STORAGE_UNAVAILABLE_MESSAGE
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.services.leases.exceptions.template_storage_unavailable_error import (
    TemplateStorageUnavailableError,
)

_BUCKET = "mbk-private-bucket-7f3a"
_ID = uuid.uuid4()
_JPEG = ("a.jpg", b"\xff\xd8\xff\xe0jpeg", "image/jpeg")
_PDF = ("r.pdf", b"%PDF-1.4\nx", "application/pdf")


def _not_configured() -> StorageNotConfiguredError:
    with pytest.raises(StorageNotConfiguredError) as info:
        build_storage_client(endpoint="", access_key="", secret_key="", bucket=_BUCKET)
    return info.value


def _today() -> str:
    return _dt.date.today().isoformat()


Call = Callable[[TestClient], Response]

STORAGE_ROUTES: list[tuple[str, Call]] = [
    (
        "app.api.lease_templates.lease_template_upload_service.upload_template",
        lambda c: c.post("/lease-templates", data={"name": "T"}, files={"files": ("a.md", b"x", "text/markdown")}),
    ),
    (
        "app.api.lease_templates.lease_template_upload_service.replace_template_files",
        lambda c: c.post(f"/lease-templates/{_ID}/files", files={"files": ("a.md", b"x", "text/markdown")}),
    ),
    (
        "app.api.lease_templates.lease_template_service.suggest_ai_placeholders",
        lambda c: c.post(f"/lease-templates/{_ID}/suggest-placeholders"),
    ),
    (
        "app.api.signed_leases.signed_lease_service.generate_lease",
        lambda c: c.post(f"/signed-leases/{_ID}/generate", json={"today": _today()}),
    ),
    (
        "app.api.signed_leases.signed_lease_service.import_signed_lease",
        lambda c: c.post("/signed-leases/import", data={"applicant_id": str(_ID)}, files={"files": _PDF}),
    ),
    (
        "app.api.signed_lease_attachments.signed_lease_service.upload_attachment",
        lambda c: c.post(f"/signed-leases/{_ID}/attachments", data={"kind": "signed_lease"}, files={"file": _PDF}),
    ),
    (
        "app.api.listings.listing_photo_service.upload_photos",
        lambda c: c.post(f"/listings/{_ID}/photos", files=[("files", _JPEG)]),
    ),
    (
        "app.api.blackouts.blackout_service.upload_attachment",
        lambda c: c.post(f"/listings/blackouts/{_ID}/attachments", files={"file": _PDF}),
    ),
    (
        "app.api.screening.screening_service.record_result",
        lambda c: c.post(f"/applicants/{_ID}/screening/upload-result", data={"status": "pass"}, files={"file": _PDF}),
    ),
    (
        "app.api.welcome_manual_section_images.welcome_manual_section_image_service.upload_images",
        lambda c: c.post(f"/welcome-manuals/{_ID}/sections/{_ID}/images", files=[("files", _JPEG)]),
    ),
]


@pytest.fixture
def client() -> Iterator[TestClient]:
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    app.dependency_overrides[require_write_access] = lambda: ctx
    app.dependency_overrides[current_org_member] = lambda: ctx
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(("target", "call"), STORAGE_ROUTES, ids=[t.rsplit(".", 2)[0] + "." + t.rsplit(".", 1)[1] for t, _ in STORAGE_ROUTES])
def test_storage_not_configured_is_a_503_with_our_copy(
    client: TestClient, caplog: pytest.LogCaptureFixture, target: str, call: Call,
) -> None:
    with patch(target, side_effect=_not_configured()), caplog.at_level(logging.ERROR):
        resp = call(client)

    assert resp.status_code == 503, resp.text
    assert resp.json()["detail"] == STORAGE_NOT_CONFIGURED_DETAIL
    assert "MINIO" not in resp.text
    assert _BUCKET not in resp.text
    assert any("MINIO_ENDPOINT" in r.getMessage() for r in caplog.records)


def test_render_storage_outage_is_a_503_with_our_copy_and_logs_the_cause(
    client: TestClient, caplog: pytest.LogCaptureFixture,
) -> None:
    cause = OSError(f"connect to minio.internal:9000 failed for {_BUCKET}")
    error = TemplateStorageUnavailableError(STORAGE_UNAVAILABLE_MESSAGE)
    error.__cause__ = cause

    with (
        patch("app.api.signed_leases.signed_lease_service.generate_lease", side_effect=error),
        caplog.at_level(logging.ERROR, logger="app.api.lease_render_error_mapping"),
    ):
        resp = client.post(f"/signed-leases/{_ID}/generate", json={"today": _today()})

    assert resp.status_code == 503
    assert resp.json()["detail"] == STORAGE_UNAVAILABLE_MESSAGE
    assert "minio.internal" not in resp.text
    assert any(r.exc_info and r.exc_info[1] is error for r in caplog.records)
