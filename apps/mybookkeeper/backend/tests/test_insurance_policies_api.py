"""Route-level tests for the insurance policies API.

Tenant-isolation tests at the API layer: cross-tenant access must surface as
404. Service layer is mocked — deeper repo/model coverage lives in
``test_insurance_policy_repo.py``.
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


def _ok_policy_response(policy_id: uuid.UUID, org_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    """Build a minimal policy response payload."""
    from app.schemas.insurance.insurance_policy_response import InsurancePolicyResponse
    return InsurancePolicyResponse(
        id=policy_id,
        user_id=user_id,
        organization_id=org_id,
        listing_id=uuid.uuid4(),
        policy_name="Landlord Insurance",
        carrier="State Farm",
        policy_number=None,
        effective_date=_dt.date(2025, 1, 1),
        expiration_date=_dt.date(2026, 1, 1),
        coverage_amount_cents=50000000,
        notes=None,
        created_at=_dt.datetime.now(_dt.timezone.utc),
        updated_at=_dt.datetime.now(_dt.timezone.utc),
        attachments=[],
    )


def _ok_list_response(policies: list) -> dict:
    from app.schemas.insurance.insurance_policy_list_response import InsurancePolicyListResponse
    from app.schemas.insurance.insurance_policy_summary import InsurancePolicySummary
    items = [InsurancePolicySummary.model_validate(p) for p in policies]
    return InsurancePolicyListResponse(items=items, total=len(items), has_more=False)


# ---------------------------------------------------------------------------
# POST /insurance-policies
# ---------------------------------------------------------------------------

class TestCreateInsurancePolicy:
    def test_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.insurance_policies.insurance_policy_service.create_policy",
                return_value=_ok_policy_response(policy_id, org_id, user_id),
            ):
                client = TestClient(app)
                resp = client.post(
                    "/insurance-policies",
                    json={
                        "listing_id": str(uuid.uuid4()),
                        "policy_name": "Landlord Insurance",
                        "carrier": "State Farm",
                        "expiration_date": "2026-01-01",
                    },
                )
            assert resp.status_code == 201, resp.text
            body = resp.json()
            assert body["policy_name"] == "Landlord Insurance"
            assert body["carrier"] == "State Farm"
        finally:
            app.dependency_overrides.clear()

    def test_extra_field_rejected(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            resp = client.post(
                "/insurance-policies",
                json={
                    "listing_id": str(uuid.uuid4()),
                    "policy_name": "Test",
                    "UNKNOWN_FIELD": "hax",
                },
            )
            assert resp.status_code == 422, resp.text
        finally:
            app.dependency_overrides.clear()

    def test_missing_policy_name_rejected(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            resp = client.post(
                "/insurance-policies",
                json={"listing_id": str(uuid.uuid4())},  # missing policy_name
            )
            assert resp.status_code == 422, resp.text
        finally:
            app.dependency_overrides.clear()

    def test_empty_policy_name_rejected(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            resp = client.post(
                "/insurance-policies",
                json={"listing_id": str(uuid.uuid4()), "policy_name": ""},
            )
            assert resp.status_code == 422, resp.text
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /insurance-policies
# ---------------------------------------------------------------------------

class TestListInsurancePolicies:
    def test_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.insurance_policies.insurance_policy_service.list_policies",
                return_value=_ok_list_response([]),
            ):
                client = TestClient(app)
                resp = client.get("/insurance-policies")
            assert resp.status_code == 200, resp.text
            body = resp.json()
            assert "items" in body
            assert body["total"] == 0
        finally:
            app.dependency_overrides.clear()

    def test_filter_by_listing_id(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.insurance_policies.insurance_policy_service.list_policies",
                return_value=_ok_list_response([]),
            ) as mock_list:
                client = TestClient(app)
                resp = client.get(
                    "/insurance-policies",
                    params={"listing_id": str(listing_id)},
                )
            assert resp.status_code == 200, resp.text
            # Ensure listing_id was forwarded to the service.
            call_kwargs = mock_list.call_args.kwargs
            assert str(call_kwargs["listing_id"]) == str(listing_id)
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /insurance-policies/{policy_id}
# ---------------------------------------------------------------------------

class TestGetInsurancePolicy:
    def test_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.insurance_policies.insurance_policy_service.get_policy",
                return_value=_ok_policy_response(policy_id, org_id, user_id),
            ):
                client = TestClient(app)
                resp = client.get(f"/insurance-policies/{policy_id}")
            assert resp.status_code == 200, resp.text
            assert resp.json()["id"] == str(policy_id)
        finally:
            app.dependency_overrides.clear()

    def test_cross_tenant_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            from app.services.insurance.insurance_policy_service import InsurancePolicyNotFoundError
            with patch(
                "app.api.insurance_policies.insurance_policy_service.get_policy",
                side_effect=InsurancePolicyNotFoundError("not found"),
            ):
                client = TestClient(app)
                resp = client.get(f"/insurance-policies/{policy_id}")
            assert resp.status_code == 404, resp.text
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# PATCH /insurance-policies/{policy_id}
# ---------------------------------------------------------------------------

class TestUpdateInsurancePolicy:
    def test_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.insurance_policies.insurance_policy_service.update_policy",
                return_value=_ok_policy_response(policy_id, org_id, user_id),
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/insurance-policies/{policy_id}",
                    json={"carrier": "Allstate"},
                )
            assert resp.status_code == 200, resp.text
        finally:
            app.dependency_overrides.clear()

    def test_extra_field_rejected(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            resp = client.patch(
                f"/insurance-policies/{policy_id}",
                json={"UNKNOWN_FIELD": "hax"},
            )
            assert resp.status_code == 422, resp.text
        finally:
            app.dependency_overrides.clear()

    def test_cross_tenant_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            from app.services.insurance.insurance_policy_service import InsurancePolicyNotFoundError
            with patch(
                "app.api.insurance_policies.insurance_policy_service.update_policy",
                side_effect=InsurancePolicyNotFoundError("not found"),
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/insurance-policies/{policy_id}",
                    json={"carrier": "Allstate"},
                )
            assert resp.status_code == 404, resp.text
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# DELETE /insurance-policies/{policy_id}
# ---------------------------------------------------------------------------

class TestDeleteInsurancePolicy:
    def test_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.insurance_policies.insurance_policy_service.soft_delete_policy",
                return_value=None,
            ):
                client = TestClient(app)
                resp = client.delete(f"/insurance-policies/{policy_id}")
            assert resp.status_code == 204, resp.text
        finally:
            app.dependency_overrides.clear()

    def test_cross_tenant_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            from app.services.insurance.insurance_policy_service import InsurancePolicyNotFoundError
            with patch(
                "app.api.insurance_policies.insurance_policy_service.soft_delete_policy",
                side_effect=InsurancePolicyNotFoundError("not found"),
            ):
                client = TestClient(app)
                resp = client.delete(f"/insurance-policies/{policy_id}")
            assert resp.status_code == 404, resp.text
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /insurance-policies/{policy_id}/attachments
# ---------------------------------------------------------------------------

class TestUploadInsurancePolicyAttachment:
    def _ok_attachment_response(self, policy_id: uuid.UUID) -> dict:
        from app.schemas.insurance.insurance_policy_attachment_response import (
            InsurancePolicyAttachmentResponse,
        )
        return InsurancePolicyAttachmentResponse(
            id=uuid.uuid4(),
            policy_id=policy_id,
            filename="policy.pdf",
            storage_key=f"insurance-policies/{policy_id}/test-attachment",
            content_type="application/pdf",
            size_bytes=1024,
            kind="policy_document",
            uploaded_by_user_id=uuid.uuid4(),
            uploaded_at=_dt.datetime.now(_dt.timezone.utc),
            presigned_url="https://signed/test",
        )

    def test_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.insurance_policies.insurance_policy_service.upload_attachment",
                return_value=self._ok_attachment_response(policy_id),
            ):
                client = TestClient(app)
                resp = client.post(
                    f"/insurance-policies/{policy_id}/attachments",
                    data={"kind": "policy_document"},
                    files={"file": ("policy.pdf", BytesIO(b"%PDF test"), "application/pdf")},
                )
            assert resp.status_code == 201, resp.text
            body = resp.json()
            assert body["kind"] == "policy_document"
        finally:
            app.dependency_overrides.clear()

    def test_cross_tenant_policy_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            from app.services.insurance.insurance_policy_service import InsurancePolicyNotFoundError
            with patch(
                "app.api.insurance_policies.insurance_policy_service.upload_attachment",
                side_effect=InsurancePolicyNotFoundError("not found"),
            ):
                client = TestClient(app)
                resp = client.post(
                    f"/insurance-policies/{policy_id}/attachments",
                    data={"kind": "policy_document"},
                    files={"file": ("policy.pdf", BytesIO(b"%PDF test"), "application/pdf")},
                )
            assert resp.status_code == 404, resp.text
        finally:
            app.dependency_overrides.clear()

    def test_too_large_returns_413(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            from app.services.insurance.insurance_policy_service import AttachmentTooLargeError
            with patch(
                "app.api.insurance_policies.insurance_policy_service.upload_attachment",
                side_effect=AttachmentTooLargeError("too large"),
            ):
                client = TestClient(app)
                resp = client.post(
                    f"/insurance-policies/{policy_id}/attachments",
                    data={"kind": "policy_document"},
                    files={"file": ("policy.pdf", BytesIO(b"%PDF test"), "application/pdf")},
                )
            assert resp.status_code == 413, resp.text
        finally:
            app.dependency_overrides.clear()

    def test_unsupported_type_returns_415(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            from app.services.insurance.insurance_policy_service import AttachmentTypeRejectedError
            with patch(
                "app.api.insurance_policies.insurance_policy_service.upload_attachment",
                side_effect=AttachmentTypeRejectedError("unsupported"),
            ):
                client = TestClient(app)
                resp = client.post(
                    f"/insurance-policies/{policy_id}/attachments",
                    data={"kind": "policy_document"},
                    files={"file": ("policy.exe", BytesIO(b"exec"), "application/octet-stream")},
                )
            assert resp.status_code == 415, resp.text
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# DELETE /insurance-policies/{policy_id}/attachments/{attachment_id}
# ---------------------------------------------------------------------------

class TestDeleteInsurancePolicyAttachment:
    def test_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        attachment_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.insurance_policies.insurance_policy_service.delete_attachment",
                return_value=None,
            ):
                client = TestClient(app)
                resp = client.delete(
                    f"/insurance-policies/{policy_id}/attachments/{attachment_id}",
                )
            assert resp.status_code == 204, resp.text
        finally:
            app.dependency_overrides.clear()

    def test_cross_tenant_attachment_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        policy_id = uuid.uuid4()
        attachment_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            from app.services.insurance.insurance_policy_service import AttachmentNotFoundError
            with patch(
                "app.api.insurance_policies.insurance_policy_service.delete_attachment",
                side_effect=AttachmentNotFoundError("not found"),
            ):
                client = TestClient(app)
                resp = client.delete(
                    f"/insurance-policies/{policy_id}/attachments/{attachment_id}",
                )
            assert resp.status_code == 404, resp.text
        finally:
            app.dependency_overrides.clear()
