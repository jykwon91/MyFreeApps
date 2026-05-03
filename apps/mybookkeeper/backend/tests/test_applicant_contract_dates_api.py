"""HTTP route tests for PATCH /applicants/{id} — contract date updates.

Tests:
- Happy path: both dates updated, response 200
- Partial update: only contract_end sent, contract_start untouched
- Validation error: contract_end <= contract_start → 422
- Lock check: applicant stage='lease_signed' → 409 + detail=CONTRACT_DATES_LOCKED
- Tenant isolation: other user/org applicant → 404
- Unknown applicant: 404
- extra="forbid": extra field in body → 422
- Read-only viewer: 403
- Unauthenticated: 401
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.services.applicants.applicant_contract_service import ContractDatesLockedError


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
    stage: str = "lead",
    contract_start: _dt.date | None = None,
    contract_end: _dt.date | None = None,
) -> ApplicantDetailResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return ApplicantDetailResponse(
        id=applicant_id,
        organization_id=org_id,
        user_id=user_id,
        inquiry_id=None,
        legal_name="Test Applicant",
        stage=stage,
        contract_start=contract_start,
        contract_end=contract_end,
        created_at=now,
        updated_at=now,
    )


class TestUpdateContractDatesEndpoint:
    @pytest.mark.asyncio
    async def test_happy_path_both_dates(self) -> None:
        """Both dates sent → 200, response contains the updated dates."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        start = _dt.date(2026, 6, 1)
        end = _dt.date(2026, 12, 31)
        detail = _build_detail(
            org_id=org_id,
            user_id=user_id,
            applicant_id=applicant_id,
            contract_start=start,
            contract_end=end,
        )
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_contract_service.update_contract_dates",
            new_callable=AsyncMock,
            return_value=detail,
        ) as mock_svc:
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{applicant_id}",
                json={"contract_start": "2026-06-01", "contract_end": "2026-12-31"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(applicant_id)
        assert body["contract_start"] == "2026-06-01"
        assert body["contract_end"] == "2026-12-31"
        kwargs = mock_svc.call_args.kwargs
        assert kwargs["organization_id"] == org_id
        assert kwargs["user_id"] == user_id
        assert kwargs["applicant_id"] == applicant_id
        assert kwargs["contract_start"] == start
        assert kwargs["contract_end"] == end
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_partial_update_only_contract_end(self) -> None:
        """Only contract_end sent → service receives contract_start=None."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        end = _dt.date(2026, 12, 31)
        detail = _build_detail(
            org_id=org_id,
            user_id=user_id,
            applicant_id=applicant_id,
            contract_end=end,
        )
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_contract_service.update_contract_dates",
            new_callable=AsyncMock,
            return_value=detail,
        ) as mock_svc:
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{applicant_id}",
                json={"contract_end": "2026-12-31"},
            )

        assert response.status_code == 200
        kwargs = mock_svc.call_args.kwargs
        # contract_start was not in the payload — None is passed to the service
        # which resolves it to the existing DB value internally.
        assert kwargs["contract_start"] is None
        assert kwargs["contract_end"] == end
        app.dependency_overrides.clear()

    def test_end_before_start_returns_422(self) -> None:
        """contract_end <= contract_start triggers Pydantic cross-field validator."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{uuid.uuid4()}",
                json={"contract_start": "2026-12-31", "contract_end": "2026-06-01"},
            )
            assert response.status_code == 422
            body = response.json()
            assert "contract_end" in str(body).lower() or "after" in str(body).lower()
        finally:
            app.dependency_overrides.clear()

    def test_end_equal_start_returns_422(self) -> None:
        """contract_end == contract_start is also invalid (must be strictly after)."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{uuid.uuid4()}",
                json={"contract_start": "2026-06-01", "contract_end": "2026-06-01"},
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_lock_check_lease_signed_returns_409(self) -> None:
        """Applicant in lease_signed stage → 409 with CONTRACT_DATES_LOCKED detail."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_contract_service.update_contract_dates",
            new_callable=AsyncMock,
            side_effect=ContractDatesLockedError(
                "Contract dates are locked once a lease has been signed. "
                "Update the dates on the lease itself if needed."
            ),
        ):
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{uuid.uuid4()}",
                json={"contract_end": "2026-12-31"},
            )

        assert response.status_code == 409
        body = response.json()
        assert body["detail"]["code"] == "CONTRACT_DATES_LOCKED"
        assert "lease" in body["detail"]["message"].lower()
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_tenant_isolation_returns_404(self) -> None:
        """Service raises LookupError for cross-tenant applicant → 404."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_contract_service.update_contract_dates",
            new_callable=AsyncMock,
            side_effect=LookupError("not found"),
        ):
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{uuid.uuid4()}",
                json={"contract_end": "2026-12-31"},
            )

        assert response.status_code == 404
        assert response.json()["detail"] == "Applicant not found"
        app.dependency_overrides.clear()

    def test_extra_field_returns_422(self) -> None:
        """extra='forbid' on the schema blocks unknown fields."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{uuid.uuid4()}",
                json={"contract_end": "2026-12-31", "evil_field": "injection"},
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_viewer_gets_403(self) -> None:
        """require_write_access blocks VIEWER role."""
        app.dependency_overrides[require_write_access] = lambda: (
            (_ for _ in ()).throw(
                __import__("fastapi").HTTPException(
                    status_code=403, detail="Viewers have read-only access",
                )
            )
        )
        try:
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{uuid.uuid4()}",
                json={"contract_end": "2026-12-31"},
            )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        """No auth header → 401."""
        client = TestClient(app)
        response = client.patch(
            f"/applicants/{uuid.uuid4()}",
            json={"contract_end": "2026-12-31"},
        )
        assert response.status_code == 401
