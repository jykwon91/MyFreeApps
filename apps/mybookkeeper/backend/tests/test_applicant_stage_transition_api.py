"""HTTP route tests for PATCH /applicants/{id}/stage.

Tests:
- Happy path: transition with + without a note
- Tenant isolation: other user/org gets 404
- Invalid transition (terminal stage, bad pair)
- Unknown stage value: 422
- Note length cap: 501 chars → 422, 500 chars OK, null note OK
- Read-only viewer gets 403 (require_write_access)
- Unauthenticated gets 401
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
    stage: str = "approved",
) -> ApplicantDetailResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return ApplicantDetailResponse(
        id=applicant_id,
        organization_id=org_id,
        user_id=user_id,
        inquiry_id=None,
        legal_name="Prince Kapoor",
        stage=stage,
        created_at=now,
        updated_at=now,
    )


class TestStageTransitionEndpoint:
    @pytest.mark.asyncio
    async def test_happy_path_with_note(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        detail = _build_detail(
            org_id=org_id, user_id=user_id, applicant_id=applicant_id, stage="approved",
        )
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_stage_service.transition_stage",
            new_callable=AsyncMock,
            return_value=detail,
        ) as mock_svc:
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{applicant_id}/stage",
                json={"new_stage": "approved", "note": "References checked separately"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["stage"] == "approved"
        assert body["id"] == str(applicant_id)
        kwargs = mock_svc.call_args.kwargs
        assert kwargs["new_stage"] == "approved"
        assert kwargs["note"] == "References checked separately"
        assert kwargs["organization_id"] == org_id
        assert kwargs["user_id"] == user_id
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_happy_path_no_note(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        detail = _build_detail(
            org_id=org_id, user_id=user_id, applicant_id=applicant_id, stage="declined",
        )
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_stage_service.transition_stage",
            new_callable=AsyncMock,
            return_value=detail,
        ):
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{applicant_id}/stage",
                json={"new_stage": "declined"},
            )

        assert response.status_code == 200
        assert response.json()["stage"] == "declined"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_tenant_isolation_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_stage_service.transition_stage",
            new_callable=AsyncMock,
            side_effect=LookupError("not found"),
        ):
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{uuid.uuid4()}/stage",
                json={"new_stage": "approved"},
            )

        assert response.status_code == 404
        assert response.json()["detail"] == "Applicant not found"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_invalid_transition_returns_422(self) -> None:
        from app.services.applicants.applicant_stage_service import InvalidTransitionError

        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_stage_service.transition_stage",
            new_callable=AsyncMock,
            side_effect=InvalidTransitionError(
                "Cannot transition from 'lease_signed' to 'lead'.",
            ),
        ):
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{uuid.uuid4()}/stage",
                json={"new_stage": "lead"},
            )

        assert response.status_code == 422
        assert "lease_signed" in response.json()["detail"] or "Cannot" in response.json()["detail"]
        app.dependency_overrides.clear()

    def test_unknown_stage_value_returns_422(self) -> None:
        from app.services.applicants.applicant_stage_service import InvalidStageError

        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_stage_service.transition_stage",
            new_callable=AsyncMock,
            side_effect=InvalidStageError("Unknown stage 'banana'"),
        ):
            try:
                client = TestClient(app)
                response = client.patch(
                    f"/applicants/{uuid.uuid4()}/stage",
                    json={"new_stage": "banana"},
                )
                assert response.status_code == 422
            finally:
                app.dependency_overrides.clear()

    def test_note_too_long_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{uuid.uuid4()}/stage",
                json={"new_stage": "approved", "note": "x" * 501},
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_note_at_max_length_is_accepted(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        detail = _build_detail(
            org_id=org_id, user_id=user_id, applicant_id=applicant_id,
        )
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_stage_service.transition_stage",
            new_callable=AsyncMock,
            return_value=detail,
        ):
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{applicant_id}/stage",
                json={"new_stage": "approved", "note": "x" * 500},
            )

        assert response.status_code == 200
        app.dependency_overrides.clear()

    def test_extra_fields_rejected(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.patch(
                f"/applicants/{uuid.uuid4()}/stage",
                json={"new_stage": "approved", "evil_field": "injection"},
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

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
            response = client.patch(
                f"/applicants/{uuid.uuid4()}/stage",
                json={"new_stage": "approved"},
            )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.patch(
            f"/applicants/{uuid.uuid4()}/stage",
            json={"new_stage": "approved"},
        )
        assert response.status_code == 401
