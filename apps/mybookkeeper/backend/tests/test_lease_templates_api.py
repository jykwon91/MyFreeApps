"""Route-level tests for the lease-templates and signed-leases APIs.

Tenant-isolation tests at the API layer: cross-tenant access must surface as
404 (or 503 / 413 / 415 / 409 for non-tenant errors). The service layer is
mocked here — the deeper repository / pipeline coverage lives in
``test_lease_template_repo.py`` and ``test_lease_renderer.py``.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from io import BytesIO
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _ok_template_response(template_id: uuid.UUID) -> dict:
    """Build a minimal response payload that satisfies LeaseTemplateResponse."""
    from app.schemas.leases.lease_template_response import LeaseTemplateResponse

    return LeaseTemplateResponse(
        id=template_id,
        user_id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        name="Default Lease",
        description=None,
        version=1,
        files=[],
        placeholders=[],
        created_at=_dt.datetime.now(_dt.timezone.utc),
        updated_at=_dt.datetime.now(_dt.timezone.utc),
    )


# ---------------------------------------------------------------------------
# POST /lease-templates
# ---------------------------------------------------------------------------

class TestCreateLeaseTemplate:
    def test_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id = uuid.uuid4()

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.upload_template",
                return_value=_ok_template_response(template_id),
            ):
                client = TestClient(app)
                resp = client.post(
                    "/lease-templates",
                    data={"name": "Default Lease"},
                    files={
                        "files": (
                            "lease.md",
                            BytesIO(b"# Lease\n[TENANT FULL NAME]"),
                            "text/markdown",
                        ),
                    },
                )
            assert resp.status_code == 201, resp.text
            body = resp.json()
            assert body["name"] == "Default Lease"
        finally:
            app.dependency_overrides.clear()

    def test_storage_unconfigured_returns_503(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()

        from app.services.leases.lease_template_service import (
            StorageNotConfiguredError,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.upload_template",
                side_effect=StorageNotConfiguredError("not configured"),
            ):
                client = TestClient(app)
                resp = client.post(
                    "/lease-templates",
                    data={"name": "T"},
                    files={"files": ("a.md", BytesIO(b"x"), "text/markdown")},
                )
            assert resp.status_code == 503
        finally:
            app.dependency_overrides.clear()

    def test_too_large_returns_413(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()

        from app.services.leases.lease_template_service import (
            TemplateFileTooLargeError,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.upload_template",
                side_effect=TemplateFileTooLargeError("too big"),
            ):
                client = TestClient(app)
                resp = client.post(
                    "/lease-templates",
                    data={"name": "T"},
                    files={"files": ("a.md", BytesIO(b"x"), "text/markdown")},
                )
            assert resp.status_code == 413
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# DELETE /lease-templates/{id}
# ---------------------------------------------------------------------------

class TestDeleteLeaseTemplate:
    def test_delete_with_active_lease_returns_409(self) -> None:
        """Soft-delete must reject when active signed leases reference the template."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id = uuid.uuid4()

        from app.services.leases.lease_template_service import TemplateInUseError

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.soft_delete_template",
                side_effect=TemplateInUseError("Cannot delete — active leases reference it"),
            ):
                client = TestClient(app)
                resp = client.delete(f"/lease-templates/{template_id}")
            assert resp.status_code == 409
            assert resp.json()["detail"]["code"] == "template_in_use"
        finally:
            app.dependency_overrides.clear()

    def test_cross_tenant_returns_404(self) -> None:
        """Cross-tenant delete must look identical to a missing row."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id = uuid.uuid4()

        from app.services.leases.lease_template_service import (
            TemplateNotFoundError,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.soft_delete_template",
                side_effect=TemplateNotFoundError("nope"),
            ):
                client = TestClient(app)
                resp = client.delete(f"/lease-templates/{template_id}")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# PATCH /lease-templates/{id}/placeholders/{id}
# ---------------------------------------------------------------------------

class TestUpdatePlaceholder:
    def test_invalid_computed_expr_returns_400(self) -> None:
        """Eval-style payloads must be rejected at the boundary."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id, placeholder_id = uuid.uuid4(), uuid.uuid4()

        from app.services.leases.lease_template_service import (
            InvalidComputedExprError,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.update_placeholder",
                side_effect=InvalidComputedExprError(
                    "Unsupported computed expression",
                ),
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/lease-templates/{template_id}/placeholders/{placeholder_id}",
                    json={"computed_expr": "__import__('os').system('whoami')"},
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_invalid_default_source_returns_422(self) -> None:
        """An arbitrary default_source string must be rejected with 422."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id, placeholder_id = uuid.uuid4(), uuid.uuid4()

        from app.services.leases.lease_template_service import (
            InvalidDefaultSourceError,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.update_placeholder",
                side_effect=InvalidDefaultSourceError(
                    "Invalid default_source segment 'foo.bar'",
                ),
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/lease-templates/{template_id}/placeholders/{placeholder_id}",
                    json={"default_source": "foo.bar"},
                )
            assert resp.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_valid_pipe_chain_default_source_accepted(self) -> None:
        """A valid || chain must reach the service (no early rejection)."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id, placeholder_id = uuid.uuid4(), uuid.uuid4()

        import datetime as _dt
        from app.schemas.leases.lease_template_placeholder_response import (
            LeaseTemplatePlaceholderResponse,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            mock_resp = LeaseTemplatePlaceholderResponse(
                id=placeholder_id,
                template_id=template_id,
                key="TENANT FULL NAME",
                display_label="Tenant full name",
                input_type="text",
                required=True,
                default_source="applicant.legal_name || inquiry.inquirer_name",
                computed_expr=None,
                display_order=0,
                created_at=_dt.datetime.now(_dt.timezone.utc),
                updated_at=_dt.datetime.now(_dt.timezone.utc),
            )
            with patch(
                "app.api.lease_templates.lease_template_service.update_placeholder",
                return_value=mock_resp,
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/lease-templates/{template_id}/placeholders/{placeholder_id}",
                    json={
                        "default_source": "applicant.legal_name || inquiry.inquirer_name"
                    },
                )
            assert resp.status_code == 200
            assert (
                resp.json()["default_source"]
                == "applicant.legal_name || inquiry.inquirer_name"
            )
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /lease-templates/{id}/generate-defaults
# ---------------------------------------------------------------------------

class TestGetGenerateDefaults:
    def test_happy_path_returns_defaults_list(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id, applicant_id = uuid.uuid4(), uuid.uuid4()

        from app.schemas.leases.generate_defaults_response import (
            GenerateDefaultsResponse,
            PlaceholderDefault,
        )

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            mock_defaults = [
                {"key": "TENANT FULL NAME", "value": "Jane Doe", "provenance": "applicant"},
                {"key": "TENANT EMAIL", "value": None, "provenance": None},
            ]
            with patch(
                "app.api.lease_templates.lease_template_service.generate_defaults",
                return_value=mock_defaults,
            ):
                client = TestClient(app)
                resp = client.get(
                    f"/lease-templates/{template_id}/generate-defaults",
                    params={"applicant_id": str(applicant_id)},
                )
            assert resp.status_code == 200
            body = resp.json()
            assert len(body["defaults"]) == 2
            assert body["defaults"][0]["key"] == "TENANT FULL NAME"
            assert body["defaults"][0]["value"] == "Jane Doe"
            assert body["defaults"][0]["provenance"] == "applicant"
            assert body["defaults"][1]["value"] is None
        finally:
            app.dependency_overrides.clear()

    def test_template_not_found_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id, applicant_id = uuid.uuid4(), uuid.uuid4()

        from app.services.leases.lease_template_service import TemplateNotFoundError

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.generate_defaults",
                side_effect=TemplateNotFoundError("not found"),
            ):
                client = TestClient(app)
                resp = client.get(
                    f"/lease-templates/{template_id}/generate-defaults",
                    params={"applicant_id": str(applicant_id)},
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_applicant_not_found_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id, applicant_id = uuid.uuid4(), uuid.uuid4()

        from app.services.leases.lease_template_service import ApplicantNotFoundError

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.lease_templates.lease_template_service.generate_defaults",
                side_effect=ApplicantNotFoundError("not found"),
            ):
                client = TestClient(app)
                resp = client.get(
                    f"/lease-templates/{template_id}/generate-defaults",
                    params={"applicant_id": str(applicant_id)},
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /signed-leases/{id}/generate
# ---------------------------------------------------------------------------

class TestGenerateLease:
    def test_storage_unavailable_returns_503(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        lease_id = uuid.uuid4()

        from app.services.leases.signed_lease_service import (
            StorageNotConfiguredError,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.generate_lease",
                side_effect=StorageNotConfiguredError("not configured"),
            ):
                client = TestClient(app)
                resp = client.post(f"/signed-leases/{lease_id}/generate")
            assert resp.status_code == 503
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# DELETE /signed-leases/{id}/attachments/{id} — IDOR guard
# ---------------------------------------------------------------------------

class TestDeleteAttachmentIdor:
    def test_cross_tenant_returns_404(self) -> None:
        """Pairing a foreign attachment_id with own lease_id must look like a miss."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        lease_id, attachment_id = uuid.uuid4(), uuid.uuid4()

        from app.services.leases.signed_lease_service import (
            AttachmentNotFoundError,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.delete_attachment",
                side_effect=AttachmentNotFoundError("not found"),
            ):
                client = TestClient(app)
                resp = client.delete(
                    f"/signed-leases/{lease_id}/attachments/{attachment_id}",
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# PATCH /signed-leases/{id} — values frozen post-draft
# ---------------------------------------------------------------------------

class TestUpdateLeaseValuesFrozen:
    def test_edit_values_post_draft_returns_409(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        lease_id = uuid.uuid4()

        from app.services.leases.signed_lease_service import CannotEditValuesError

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.update_lease",
                side_effect=CannotEditValuesError(
                    "Values can only be edited while the lease is a draft",
                ),
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/signed-leases/{lease_id}",
                    json={"values": {"x": "y"}},
                )
            assert resp.status_code == 409
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /signed-leases — missing required values returns 422
# ---------------------------------------------------------------------------

class TestCreateLeaseMissingRequired:
    def test_missing_required_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id = uuid.uuid4()
        applicant_id = uuid.uuid4()

        from app.services.leases.signed_lease_service import (
            MissingRequiredValuesError,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.create_lease",
                side_effect=MissingRequiredValuesError(
                    "Missing required values: TENANT FULL NAME",
                ),
            ):
                client = TestClient(app)
                resp = client.post(
                    "/signed-leases",
                    json={
                        "template_id": str(template_id),
                        "applicant_id": str(applicant_id),
                        "values": {},
                    },
                )
            assert resp.status_code == 422
        finally:
            app.dependency_overrides.clear()
