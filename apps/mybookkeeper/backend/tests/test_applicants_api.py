"""HTTP route tests for /applicants — auth + happy + 404 + tenant isolation.

Mirrors ``test_inquiries_api.py``: dependency_overrides on ``current_org_member``
to inject a test ``RequestContext``, ``patch`` on the service module to assert
calls and shape responses.

Read-only PR (3.1b) — no POST/PUT/DELETE coverage; those land with PR 3.2 / 3.3 / 3.4.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.schemas.applicants.applicant_event_response import ApplicantEventResponse
from app.schemas.applicants.applicant_list_response import ApplicantListResponse
from app.schemas.applicants.applicant_summary import ApplicantSummary
from app.schemas.applicants.reference_response import ReferenceResponse
from app.schemas.applicants.screening_result_response import ScreeningResultResponse
from app.schemas.applicants.video_call_note_response import VideoCallNoteResponse


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _build_summary(
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    stage: str = "lead",
) -> ApplicantSummary:
    now = _dt.datetime.now(_dt.timezone.utc)
    return ApplicantSummary(
        id=applicant_id,
        organization_id=org_id,
        user_id=user_id,
        inquiry_id=None,
        legal_name="Jane Doe",
        employer_or_hospital="Memorial Hermann",
        contract_start=None,
        contract_end=None,
        stage=stage,
        created_at=now,
        updated_at=now,
    )


def _build_detail(
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    stage: str = "lead",
) -> ApplicantDetailResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    screening_id = uuid.uuid4()
    reference_id = uuid.uuid4()
    note_id = uuid.uuid4()
    event_id = uuid.uuid4()
    return ApplicantDetailResponse(
        id=applicant_id,
        organization_id=org_id,
        user_id=user_id,
        inquiry_id=None,
        legal_name="Jane Doe",
        dob="1990-01-15",
        employer_or_hospital="Memorial Hermann",
        vehicle_make_model="Toyota Camry 2020",
        id_document_storage_key="docs/abc.pdf",
        smoker=False,
        pets="1 small cat",
        referred_by=None,
        stage=stage,
        created_at=now,
        updated_at=now,
        screening_results=[
            ScreeningResultResponse(
                id=screening_id,
                applicant_id=applicant_id,
                provider="keycheck",
                status="pending",
                requested_at=now,
                completed_at=None,
                created_at=now,
            ),
        ],
        references=[
            ReferenceResponse(
                id=reference_id,
                applicant_id=applicant_id,
                relationship="employer",
                reference_name="Reference R",
                reference_contact="ref@example.com",
                contacted_at=None,
                created_at=now,
                updated_at=now,
            ),
        ],
        video_call_notes=[
            VideoCallNoteResponse(
                id=note_id,
                applicant_id=applicant_id,
                scheduled_at=now,
                completed_at=None,
                gut_rating=4,
                notes="A note",
                transcript_storage_key=None,
                created_at=now,
                updated_at=now,
            ),
        ],
        events=[
            ApplicantEventResponse(
                id=event_id,
                applicant_id=applicant_id,
                event_type="lead",
                actor="host",
                notes=None,
                occurred_at=now,
                created_at=now,
            ),
        ],
    )


class TestApplicantsListEndpoint:
    @pytest.mark.asyncio
    async def test_get_returns_summaries(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        envelope = ApplicantListResponse(
            items=[_build_summary(org_id=org_id, user_id=user_id, applicant_id=applicant_id)],
            total=1,
            has_more=False,
        )
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.applicants.applicant_service.list_applicants",
            return_value=envelope,
        ):
            client = TestClient(app)
            response = client.get("/applicants")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["has_more"] is False
        assert len(body["items"]) == 1
        assert body["items"][0]["id"] == str(applicant_id)
        assert body["items"][0]["legal_name"] == "Jane Doe"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_stage_filter_passes_through(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        empty = ApplicantListResponse(items=[], total=0, has_more=False)
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_service.list_applicants",
            return_value=empty,
        ) as mock_list:
            client = TestClient(app)
            response = client.get(
                "/applicants?stage=screening_pending&limit=20&offset=10",
            )

        assert response.status_code == 200
        kwargs = mock_list.call_args.kwargs
        assert kwargs["stage"] == "screening_pending"
        assert kwargs["limit"] == 20
        assert kwargs["offset"] == 10
        assert kwargs["include_deleted"] is False
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_include_deleted_passes_through(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        empty = ApplicantListResponse(items=[], total=0, has_more=False)
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.applicants.applicant_service.list_applicants",
            return_value=empty,
        ) as mock_list:
            client = TestClient(app)
            response = client.get("/applicants?include_deleted=true")

        assert response.status_code == 200
        assert mock_list.call_args.kwargs["include_deleted"] is True
        app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.get("/applicants")
        assert response.status_code == 401

    def test_invalid_limit_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.get("/applicants?limit=999")
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()


class TestApplicantsDetailEndpoint:
    @pytest.mark.asyncio
    async def test_returns_full_payload_with_children(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        full = _build_detail(
            org_id=org_id, user_id=user_id, applicant_id=applicant_id,
        )
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.applicants.applicant_service.get_applicant",
            return_value=full,
        ):
            client = TestClient(app)
            response = client.get(f"/applicants/{applicant_id}")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(applicant_id)
        assert body["legal_name"] == "Jane Doe"
        assert body["dob"] == "1990-01-15"
        # Nested arrays — every child section should round-trip.
        assert len(body["screening_results"]) == 1
        assert body["screening_results"][0]["provider"] == "keycheck"
        assert len(body["references"]) == 1
        assert body["references"][0]["relationship"] == "employer"
        assert len(body["video_call_notes"]) == 1
        assert body["video_call_notes"][0]["gut_rating"] == 4
        assert len(body["events"]) == 1
        assert body["events"][0]["event_type"] == "lead"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_404_when_not_in_tenant(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.applicants.applicant_service.get_applicant",
            side_effect=LookupError("nope"),
        ):
            client = TestClient(app)
            response = client.get(f"/applicants/{uuid.uuid4()}")
        assert response.status_code == 404
        assert response.json()["detail"] == "Applicant not found"
        app.dependency_overrides.clear()

    def test_invalid_uuid_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.get("/applicants/not-a-uuid")
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.get(f"/applicants/{uuid.uuid4()}")
        assert response.status_code == 401
