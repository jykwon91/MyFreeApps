"""HTTP route tests for POST /applicants/promote/{inquiry_id} (PR 3.2).

Mocks the promote_service / applicant_service layer — the service-layer
behaviour is verified end-to-end in ``test_promote_service.py``. These tests
focus on:
- Auth gating (401 when unauthenticated).
- Pydantic validation (422 on invalid body).
- Status code mapping for service errors:
    LookupError → 404
    AlreadyPromotedError → 409 with applicant_id in detail
    InquiryNotPromotableError → 409 with stage in detail
- Happy-path response shape matches GET /applicants/{id}.
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


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _build_detail(
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    inquiry_id: uuid.UUID,
) -> ApplicantDetailResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return ApplicantDetailResponse(
        id=applicant_id,
        organization_id=org_id,
        user_id=user_id,
        inquiry_id=inquiry_id,
        legal_name="Alice Tester",
        dob=None,
        employer_or_hospital="Memorial Hermann",
        vehicle_make_model=None,
        id_document_storage_key=None,
        contract_start=_dt.date(2026, 6, 1),
        contract_end=_dt.date(2026, 12, 1),
        smoker=None,
        pets=None,
        referred_by=None,
        stage="lead",
        created_at=now,
        updated_at=now,
        screening_results=[],
        references=[],
        video_call_notes=[],
        events=[],
    )


class TestPromoteEndpoint:
    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.post(f"/applicants/promote/{uuid.uuid4()}", json={})
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_happy_path_returns_applicant_detail(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id, inquiry_id = uuid.uuid4(), uuid.uuid4()
        applicant_obj = type("StubApplicant", (), {"id": applicant_id})()
        detail = _build_detail(
            org_id=org_id, user_id=user_id,
            applicant_id=applicant_id, inquiry_id=inquiry_id,
        )

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.promote_service.promote_from_inquiry",
                new=AsyncMock(return_value=applicant_obj),
            ) as mock_promote, patch(
                "app.api.applicants.applicant_service.get_applicant",
                new=AsyncMock(return_value=detail),
            ) as mock_get:
                client = TestClient(app)
                response = client.post(
                    f"/applicants/promote/{inquiry_id}",
                    json={"legal_name": "Alice Tester"},
                )

            assert response.status_code == 200
            body = response.json()
            assert body["id"] == str(applicant_id)
            assert body["inquiry_id"] == str(inquiry_id)
            assert body["legal_name"] == "Alice Tester"
            assert body["stage"] == "lead"
            assert mock_promote.await_count == 1
            assert mock_get.await_count == 1
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_inquiry_not_found_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.promote_service.promote_from_inquiry",
                new=AsyncMock(side_effect=LookupError("nope")),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/applicants/promote/{inquiry_id}", json={},
                )
            assert response.status_code == 404
            assert response.json()["detail"] == "Inquiry not found"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_already_promoted_returns_409_with_applicant_id(self) -> None:
        from app.services.applicants import promote_service

        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        existing_applicant_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.promote_service.promote_from_inquiry",
                new=AsyncMock(
                    side_effect=promote_service.AlreadyPromotedError(
                        existing_applicant_id,
                    ),
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/applicants/promote/{inquiry_id}", json={},
                )
            assert response.status_code == 409
            detail = response.json()["detail"]
            assert detail["code"] == "already_promoted"
            assert detail["applicant_id"] == str(existing_applicant_id)
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_not_promotable_stage_returns_409_with_stage(self) -> None:
        from app.services.applicants import promote_service

        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.applicants.promote_service.promote_from_inquiry",
                new=AsyncMock(
                    side_effect=promote_service.InquiryNotPromotableError(
                        "declined",
                    ),
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/applicants/promote/{inquiry_id}", json={},
                )
            assert response.status_code == 409
            detail = response.json()["detail"]
            assert detail["code"] == "not_promotable"
            assert detail["stage"] == "declined"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_invalid_inquiry_uuid_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post("/applicants/promote/not-a-uuid", json={})
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_invalid_body_unknown_field_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/applicants/promote/{inquiry_id}",
                json={"unknown_field": "boom"},
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_dob_under_minimum_age_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        # A dob clearly under 18 — yesterday.
        recent_dob = (_dt.date.today() - _dt.timedelta(days=1)).isoformat()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/applicants/promote/{inquiry_id}",
                json={"dob": recent_dob},
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_contract_dates_inverted_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/applicants/promote/{inquiry_id}",
                json={
                    "contract_start": "2026-12-01",
                    "contract_end": "2026-06-01",
                },
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()
