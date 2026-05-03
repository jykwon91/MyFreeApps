"""HTTP route tests for tenant lifecycle endpoints.

Tests:
- GET /applicants/tenants — list active tenants (lease_signed stage)
- GET /applicants/tenants?include_ended=true — list including ended
- PATCH /applicants/{id}/tenancy/end — happy path + cross-tenant 404 + stage check
- PATCH /applicants/{id}/tenancy/restart — happy path + stage check
- Unauthenticated / viewer-role checks
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.schemas.applicants.applicant_summary import ApplicantSummary
from app.schemas.applicants.tenant_list_response import TenantListResponse


def _ctx(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    role: OrgRole = OrgRole.OWNER,
) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=role)


def _build_detail(
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    stage: str = "lease_signed",
    tenant_ended_at: _dt.datetime | None = None,
    tenant_ended_reason: str | None = None,
) -> ApplicantDetailResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return ApplicantDetailResponse(
        id=applicant_id,
        organization_id=org_id,
        user_id=user_id,
        inquiry_id=None,
        legal_name="Maria Chen",
        stage=stage,
        tenant_ended_at=tenant_ended_at,
        tenant_ended_reason=tenant_ended_reason,
        created_at=now,
        updated_at=now,
    )


def _build_summary(
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
) -> ApplicantSummary:
    now = _dt.datetime.now(_dt.timezone.utc)
    return ApplicantSummary(
        id=applicant_id,
        organization_id=org_id,
        user_id=user_id,
        inquiry_id=None,
        legal_name="Maria Chen",
        stage="lease_signed",
        tenant_ended_at=None,
        tenant_ended_reason=None,
        created_at=now,
        updated_at=now,
    )


class TestListTenantsEndpoint:
    @pytest.mark.asyncio
    async def test_list_active_tenants_default(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        summary = _build_summary(org_id=org_id, user_id=user_id, applicant_id=applicant_id)
        response_obj = TenantListResponse(items=[summary], total=1, has_more=False)

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.tenancy_service.list_tenants",
                new_callable=AsyncMock,
                return_value=response_obj,
            ) as mock_svc:
                client = TestClient(app)
                resp = client.get("/applicants/tenants")

            assert resp.status_code == 200
            body = resp.json()
            assert body["total"] == 1
            assert body["items"][0]["id"] == str(applicant_id)
            kwargs = mock_svc.call_args.kwargs
            assert kwargs["include_ended"] is False
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_list_tenants_include_ended(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        response_obj = TenantListResponse(items=[], total=0, has_more=False)

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.tenancy_service.list_tenants",
                new_callable=AsyncMock,
                return_value=response_obj,
            ) as mock_svc:
                client = TestClient(app)
                resp = client.get("/applicants/tenants?include_ended=true")

            assert resp.status_code == 200
            kwargs = mock_svc.call_args.kwargs
            assert kwargs["include_ended"] is True
        finally:
            app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        resp = client.get("/applicants/tenants")
        assert resp.status_code == 401


class TestEndTenancyEndpoint:
    @pytest.mark.asyncio
    async def test_happy_path_with_reason(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        now = _dt.datetime.now(_dt.timezone.utc)
        detail = _build_detail(
            org_id=org_id, user_id=user_id, applicant_id=applicant_id,
            tenant_ended_at=now, tenant_ended_reason="Did not renew",
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.tenancy_service.end_tenancy",
                new_callable=AsyncMock,
                return_value=detail,
            ) as mock_svc:
                client = TestClient(app)
                resp = client.patch(
                    f"/applicants/{applicant_id}/tenancy/end",
                    json={"reason": "Did not renew"},
                )

            assert resp.status_code == 200
            body = resp.json()
            assert body["id"] == str(applicant_id)
            kwargs = mock_svc.call_args.kwargs
            assert kwargs["reason"] == "Did not renew"
            assert kwargs["organization_id"] == org_id
            assert kwargs["user_id"] == user_id
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_happy_path_no_reason(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        now = _dt.datetime.now(_dt.timezone.utc)
        detail = _build_detail(
            org_id=org_id, user_id=user_id, applicant_id=applicant_id,
            tenant_ended_at=now,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.tenancy_service.end_tenancy",
                new_callable=AsyncMock,
                return_value=detail,
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/applicants/{applicant_id}/tenancy/end",
                    json={},
                )

            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_cross_tenant_returns_404(self) -> None:
        from app.services.applicants.tenancy_service import NotATenantError

        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.tenancy_service.end_tenancy",
                new_callable=AsyncMock,
                side_effect=LookupError("not found"),
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/applicants/{uuid.uuid4()}/tenancy/end",
                    json={"reason": "test"},
                )

            assert resp.status_code == 404
            assert resp.json()["detail"] == "Applicant not found"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_not_a_tenant_returns_409(self) -> None:
        from app.services.applicants.tenancy_service import NotATenantError

        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.tenancy_service.end_tenancy",
                new_callable=AsyncMock,
                side_effect=NotATenantError(
                    "Applicant is at stage 'approved', not 'lease_signed'."
                ),
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/applicants/{uuid.uuid4()}/tenancy/end",
                    json={"reason": "test"},
                )

            assert resp.status_code == 409
            assert "lease_signed" in resp.json()["detail"]
        finally:
            app.dependency_overrides.clear()

    def test_reason_too_long_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            resp = client.patch(
                f"/applicants/{uuid.uuid4()}/tenancy/end",
                json={"reason": "x" * 501},
            )
            assert resp.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_reason_at_max_length_accepted(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        now = _dt.datetime.now(_dt.timezone.utc)
        detail = _build_detail(
            org_id=org_id, user_id=user_id, applicant_id=applicant_id,
            tenant_ended_at=now,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.tenancy_service.end_tenancy",
                new_callable=AsyncMock,
                return_value=detail,
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/applicants/{applicant_id}/tenancy/end",
                    json={"reason": "x" * 500},
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_extra_fields_rejected(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            resp = client.patch(
                f"/applicants/{uuid.uuid4()}/tenancy/end",
                json={"reason": "ok", "evil_field": "injection"},
            )
            assert resp.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        resp = client.patch(
            f"/applicants/{uuid.uuid4()}/tenancy/end",
            json={"reason": "test"},
        )
        assert resp.status_code == 401

    def test_viewer_gets_403(self) -> None:
        app.dependency_overrides[require_write_access] = lambda: (
            (_ for _ in ()).throw(
                __import__("fastapi").HTTPException(
                    status_code=403, detail="Viewers have read-only access",
                )
            )
        )
        try:
            client = TestClient(app)
            resp = client.patch(
                f"/applicants/{uuid.uuid4()}/tenancy/end",
                json={"reason": "test"},
            )
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()


class TestRestartTenancyEndpoint:
    @pytest.mark.asyncio
    async def test_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        detail = _build_detail(
            org_id=org_id, user_id=user_id, applicant_id=applicant_id,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.tenancy_service.restart_tenancy",
                new_callable=AsyncMock,
                return_value=detail,
            ) as mock_svc:
                client = TestClient(app)
                resp = client.patch(f"/applicants/{applicant_id}/tenancy/restart")

            assert resp.status_code == 200
            assert resp.json()["id"] == str(applicant_id)
            kwargs = mock_svc.call_args.kwargs
            assert kwargs["organization_id"] == org_id
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_not_ended_returns_409(self) -> None:
        from app.services.applicants.tenancy_service import TenancyNotEndedError

        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.tenancy_service.restart_tenancy",
                new_callable=AsyncMock,
                side_effect=TenancyNotEndedError("This tenancy was not manually ended."),
            ):
                client = TestClient(app)
                resp = client.patch(f"/applicants/{uuid.uuid4()}/tenancy/restart")

            assert resp.status_code == 409
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_cross_tenant_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.tenancy_service.restart_tenancy",
                new_callable=AsyncMock,
                side_effect=LookupError("not found"),
            ):
                client = TestClient(app)
                resp = client.patch(f"/applicants/{uuid.uuid4()}/tenancy/restart")

            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        resp = client.patch(f"/applicants/{uuid.uuid4()}/tenancy/restart")
        assert resp.status_code == 401
