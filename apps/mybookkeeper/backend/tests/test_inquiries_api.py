"""HTTP route tests for /inquiries — auth + happy + 404 + 409 + tenant isolation.

Mirrors the test_listing_routes.py pattern: dependency_overrides on
``current_org_member`` / ``require_write_access`` to inject a test
RequestContext, and ``patch`` on the service module to assert calls.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.inquiries.inquiry_event_response import InquiryEventResponse
from app.schemas.inquiries.inquiry_list_response import InquiryListResponse
from app.schemas.inquiries.inquiry_response import InquiryResponse
from app.schemas.inquiries.inquiry_summary import InquirySummary
from app.services.inquiries.inquiry_service import InquiryConflictError


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _build_response(
    *, org_id: uuid.UUID, user_id: uuid.UUID, inquiry_id: uuid.UUID,
    stage: str = "new",
) -> InquiryResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return InquiryResponse(
        id=inquiry_id,
        organization_id=org_id,
        user_id=user_id,
        listing_id=None,
        source="FF",
        external_inquiry_id="I-1",
        inquirer_name="Alice",
        inquirer_email="alice@example.com",
        stage=stage,
        received_at=now,
        messages=[],
        events=[InquiryEventResponse(
            id=uuid.uuid4(),
            inquiry_id=inquiry_id,
            event_type="received",
            actor="host",
            occurred_at=now,
            created_at=now,
        )],
        created_at=now,
        updated_at=now,
    )


class TestInquiriesListEndpoint:
    @pytest.mark.asyncio
    async def test_get_returns_summaries(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        now = _dt.datetime.now(_dt.timezone.utc)

        summary = InquirySummary(
            id=inquiry_id, source="FF", listing_id=None, stage="new",
            inquirer_name="Alice", inquirer_employer="St Lukes",
            received_at=now,
        )
        envelope = InquiryListResponse(items=[summary], total=1, has_more=False)

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_service.list_inbox",
            return_value=envelope,
        ):
            client = TestClient(app)
            response = client.get("/inquiries")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["has_more"] is False
        assert len(body["items"]) == 1
        assert body["items"][0]["id"] == str(inquiry_id)
        assert body["items"][0]["source"] == "FF"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_stage_filter_passes_through(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        empty = InquiryListResponse(items=[], total=0, has_more=False)
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.inquiries.inquiry_service.list_inbox",
            return_value=empty,
        ) as mock_list:
            client = TestClient(app)
            response = client.get("/inquiries?stage=triaged&limit=20&offset=10")

        assert response.status_code == 200
        kwargs = mock_list.call_args.kwargs
        assert kwargs["stage"] == "triaged"
        assert kwargs["limit"] == 20
        assert kwargs["offset"] == 10
        app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.get("/inquiries")
        assert response.status_code == 401

    def test_invalid_limit_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.get("/inquiries?limit=999")
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()


class TestInquiriesCreateEndpoint:
    @pytest.mark.asyncio
    async def test_create_returns_201(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        full = _build_response(
            org_id=org_id, user_id=user_id, inquiry_id=inquiry_id,
        )
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_service.create_inquiry",
            return_value=full,
        ):
            client = TestClient(app)
            response = client.post("/inquiries", json={
                "source": "FF",
                "external_inquiry_id": "I-1",
                "inquirer_name": "Alice",
                "inquirer_email": "alice@example.com",
                "received_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
            })
        assert response.status_code == 201
        body = response.json()
        assert body["id"] == str(inquiry_id)
        assert body["stage"] == "new"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_duplicate_returns_409(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_service.create_inquiry",
            side_effect=InquiryConflictError("dup"),
        ):
            client = TestClient(app)
            response = client.post("/inquiries", json={
                "source": "FF",
                "external_inquiry_id": "I-dup",
                "received_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
            })
        assert response.status_code == 409
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_missing_external_id_for_FF_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post("/inquiries", json={
                "source": "FF",
                "received_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
            })
            assert response.status_code == 422, response.json()
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_unknown_source_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post("/inquiries", json={
                "source": "Zillow",
                "external_inquiry_id": "Z-1",
                "received_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
            })
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_extra_fields_rejected(self) -> None:
        """Pydantic ``extra='forbid'`` blocks attribute injection (e.g.
        ``organization_id`` from the body)."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post("/inquiries", json={
                "source": "direct",
                "received_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
                "organization_id": str(uuid.uuid4()),
            })
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()


class TestInquiriesDetailEndpoint:
    @pytest.mark.asyncio
    async def test_returns_full_payload(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        full = _build_response(
            org_id=org_id, user_id=user_id, inquiry_id=inquiry_id,
        )
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_service.get_inquiry",
            return_value=full,
        ):
            client = TestClient(app)
            response = client.get(f"/inquiries/{inquiry_id}")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(inquiry_id)
        assert len(body["events"]) == 1
        assert body["events"][0]["event_type"] == "received"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_404_when_not_in_org(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_service.get_inquiry",
            side_effect=LookupError("nope"),
        ):
            client = TestClient(app)
            response = client.get(f"/inquiries/{uuid.uuid4()}")
        assert response.status_code == 404
        app.dependency_overrides.clear()


class TestInquiriesUpdateEndpoint:
    @pytest.mark.asyncio
    async def test_patch_stage_returns_200(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id = uuid.uuid4()
        full = _build_response(
            org_id=org_id, user_id=user_id, inquiry_id=inquiry_id, stage="triaged",
        )
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_service.update_inquiry",
            return_value=full,
        ):
            client = TestClient(app)
            response = client.patch(
                f"/inquiries/{inquiry_id}",
                json={"stage": "triaged"},
            )
        assert response.status_code == 200
        assert response.json()["stage"] == "triaged"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_patch_unknown_field_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.patch(
                f"/inquiries/{uuid.uuid4()}",
                json={"organization_id": str(uuid.uuid4())},
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_patch_invalid_stage_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.patch(
                f"/inquiries/{uuid.uuid4()}",
                json={"stage": "Pending"},
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_patch_other_org_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_service.update_inquiry",
            side_effect=LookupError("not found"),
        ):
            client = TestClient(app)
            response = client.patch(
                f"/inquiries/{uuid.uuid4()}",
                json={"stage": "triaged"},
            )
        assert response.status_code == 404
        app.dependency_overrides.clear()


class TestInquiriesDeleteEndpoint:
    @pytest.mark.asyncio
    async def test_delete_returns_204(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_service.delete_inquiry",
            return_value=None,
        ):
            client = TestClient(app)
            response = client.delete(f"/inquiries/{uuid.uuid4()}")
        assert response.status_code == 204
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_delete_not_found_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.inquiry_service.delete_inquiry",
            side_effect=LookupError("missing"),
        ):
            client = TestClient(app)
            response = client.delete(f"/inquiries/{uuid.uuid4()}")
        assert response.status_code == 404
        app.dependency_overrides.clear()
