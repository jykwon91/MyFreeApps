"""Status mapping for the lease document routes' render/write failures."""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.lease_render_constants import (
    LEASE_ATTACHMENT_LOCKED_CODE,
    LEASE_ATTACHMENT_LOCKED_MESSAGE,
    LEASE_CHANGED_DURING_RENDER_DETAIL,
    LEASE_DOCUMENTS_LOCKED_CODE,
    LEASE_DOCUMENTS_LOCKED_MESSAGE,
    LEASE_VALUE_LOCKED_CODE,
    LEASE_VALUE_LOCKED_MESSAGE,
)
from app.core.lease_template_constants import STORAGE_UNAVAILABLE_MESSAGE
from app.core.permissions import require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.services.leases.exceptions.lease_attachment_locked_error import LeaseAttachmentLockedError
from app.services.leases.exceptions.lease_documents_locked_error import LeaseDocumentsLockedError
from app.services.leases.exceptions.lease_value_locked_error import LeaseValueLockedError
from app.services.leases.exceptions.lease_changed_during_render_error import (
    LeaseChangedDuringRenderError,
)
from app.services.leases.exceptions.template_storage_unavailable_error import (
    TemplateStorageUnavailableError,
)

SERVICE = "app.api.signed_leases.signed_lease_service"

def _today() -> str:
    return _dt.datetime.now(_dt.timezone.utc).date().isoformat()


CASES = [
    (LeaseChangedDuringRenderError("changed"), 409, LEASE_CHANGED_DURING_RENDER_DETAIL),
    (
        LeaseDocumentsLockedError("locked"),
        409,
        {"code": LEASE_DOCUMENTS_LOCKED_CODE, "message": LEASE_DOCUMENTS_LOCKED_MESSAGE},
    ),
    (
        LeaseValueLockedError(["RENT"]),
        422,
        {"code": LEASE_VALUE_LOCKED_CODE, "message": LEASE_VALUE_LOCKED_MESSAGE, "keys": ["RENT"]},
    ),
    (TemplateStorageUnavailableError(STORAGE_UNAVAILABLE_MESSAGE), 503, STORAGE_UNAVAILABLE_MESSAGE),
]


@pytest.fixture
def client():
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    app.dependency_overrides[require_write_access] = lambda: ctx
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(("error", "status", "detail"), CASES)
def test_generate_route_maps_render_failures(client: TestClient, error, status: int, detail: object) -> None:
    with patch(f"{SERVICE}.generate_lease", side_effect=error):
        resp = client.post(f"/signed-leases/{uuid.uuid4()}/generate", json={"today": _today()})

    assert resp.status_code == status
    assert resp.json()["detail"] == detail


@pytest.mark.parametrize(("error", "status", "detail"), CASES)
def test_add_templates_route_maps_render_failures(client: TestClient, error, status: int, detail: object) -> None:
    with patch(f"{SERVICE}.add_templates_and_generate", side_effect=error):
        resp = client.post(
            f"/signed-leases/{uuid.uuid4()}/templates",
            json={"template_ids": [str(uuid.uuid4())], "today": _today()},
        )

    assert resp.status_code == status
    assert resp.json()["detail"] == detail


UPLOAD = "app.api.signed_lease_attachments.signed_lease_service.upload_attachment"


def test_upload_route_maps_a_locked_lease_to_a_coded_409(client: TestClient) -> None:
    with patch(UPLOAD, side_effect=LeaseAttachmentLockedError("locked")):
        resp = client.post(
            f"/signed-leases/{uuid.uuid4()}/attachments",
            files={"file": ("a.pdf", b"%PDF", "application/pdf")},
            data={"kind": "rendered_original"},
        )

    assert resp.status_code == 409
    assert resp.json()["detail"] == {"code": LEASE_ATTACHMENT_LOCKED_CODE, "message": LEASE_ATTACHMENT_LOCKED_MESSAGE}


SIGNING_STATE = "app.api.signed_lease_attachments.signed_lease_service.update_attachment_signing_state"


def test_signing_state_route_maps_a_locked_signature_to_a_coded_409(client: TestClient) -> None:
    with patch(SIGNING_STATE, side_effect=LeaseAttachmentLockedError("locked")):
        resp = client.patch(
            f"/signed-leases/{uuid.uuid4()}/attachments/{uuid.uuid4()}/signing-state",
            json={"signed_by_tenant_at": None},
        )

    assert resp.status_code == 409
    assert resp.json()["detail"] == {"code": LEASE_ATTACHMENT_LOCKED_CODE, "message": LEASE_ATTACHMENT_LOCKED_MESSAGE}
