"""HTTP route tests for /vendors — auth + happy + 404 + filter pass-through.

Mirrors ``test_applicants_api.py``: dependency_overrides on
``current_org_member`` to inject a test ``RequestContext``, ``patch`` on the
service module to assert calls and shape responses.

Read-only PR (4.1a) — no POST/PATCH/DELETE coverage; those land with PR 4.2.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.vendors.vendor_list_response import VendorListResponse
from app.schemas.vendors.vendor_response import VendorResponse
from app.schemas.vendors.vendor_summary import VendorSummary


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _build_summary(
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    vendor_id: uuid.UUID,
    name: str = "Acme Plumbing",
    category: str = "plumber",
    preferred: bool = False,
) -> VendorSummary:
    now = _dt.datetime.now(_dt.timezone.utc)
    return VendorSummary(
        id=vendor_id,
        organization_id=org_id,
        user_id=user_id,
        name=name,
        category=category,
        hourly_rate=Decimal("125.00"),
        preferred=preferred,
        last_used_at=None,
        created_at=now,
        updated_at=now,
    )


def _build_response(
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    vendor_id: uuid.UUID,
) -> VendorResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return VendorResponse(
        id=vendor_id,
        organization_id=org_id,
        user_id=user_id,
        name="Acme Plumbing",
        category="plumber",
        phone="555-0101",
        email="acme@example.com",
        address="123 Pipe St",
        hourly_rate=Decimal("125.00"),
        flat_rate_notes="Flat $200 for drain",
        preferred=True,
        notes="Solid",
        last_used_at=None,
        created_at=now,
        updated_at=now,
    )


class TestVendorsListEndpoint:
    @pytest.mark.asyncio
    async def test_get_returns_summaries(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        vendor_id = uuid.uuid4()
        envelope = VendorListResponse(
            items=[_build_summary(
                org_id=org_id, user_id=user_id, vendor_id=vendor_id,
            )],
            total=1,
            has_more=False,
        )
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.vendors.vendor_service.list_vendors",
                return_value=envelope,
            ):
                client = TestClient(app)
                response = client.get("/vendors")
            assert response.status_code == 200
            body = response.json()
            assert body["total"] == 1
            assert body["has_more"] is False
            assert len(body["items"]) == 1
            assert body["items"][0]["id"] == str(vendor_id)
            assert body["items"][0]["name"] == "Acme Plumbing"
            assert body["items"][0]["category"] == "plumber"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_category_filter_passes_through(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        empty = VendorListResponse(items=[], total=0, has_more=False)
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.vendors.vendor_service.list_vendors",
                return_value=empty,
            ) as mock_list:
                client = TestClient(app)
                response = client.get(
                    "/vendors?category=hvac&limit=20&offset=10",
                )
            assert response.status_code == 200
            kwargs = mock_list.call_args.kwargs
            assert kwargs["category"] == "hvac"
            assert kwargs["limit"] == 20
            assert kwargs["offset"] == 10
            assert kwargs["preferred"] is None
            assert kwargs["include_deleted"] is False
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_preferred_filter_passes_through(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        empty = VendorListResponse(items=[], total=0, has_more=False)
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.vendors.vendor_service.list_vendors",
                return_value=empty,
            ) as mock_list:
                client = TestClient(app)
                response = client.get("/vendors?preferred=true")
            assert response.status_code == 200
            assert mock_list.call_args.kwargs["preferred"] is True
        finally:
            app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.get("/vendors")
        assert response.status_code == 401

    def test_invalid_limit_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.get("/vendors?limit=999")
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()


class TestVendorsDetailEndpoint:
    @pytest.mark.asyncio
    async def test_returns_full_payload(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        vendor_id = uuid.uuid4()
        full = _build_response(
            org_id=org_id, user_id=user_id, vendor_id=vendor_id,
        )
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.vendors.vendor_service.get_vendor",
                return_value=full,
            ):
                client = TestClient(app)
                response = client.get(f"/vendors/{vendor_id}")
            assert response.status_code == 200
            body = response.json()
            assert body["id"] == str(vendor_id)
            assert body["name"] == "Acme Plumbing"
            assert body["category"] == "plumber"
            assert body["phone"] == "555-0101"
            assert body["email"] == "acme@example.com"
            assert body["address"] == "123 Pipe St"
            assert body["hourly_rate"] == "125.00"
            assert body["flat_rate_notes"] == "Flat $200 for drain"
            assert body["preferred"] is True
            assert body["notes"] == "Solid"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_404_when_not_in_tenant(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.vendors.vendor_service.get_vendor",
                side_effect=LookupError("nope"),
            ):
                client = TestClient(app)
                response = client.get(f"/vendors/{uuid.uuid4()}")
            assert response.status_code == 404
            assert response.json()["detail"] == "Vendor not found"
        finally:
            app.dependency_overrides.clear()

    def test_invalid_uuid_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.get("/vendors/not-a-uuid")
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.get(f"/vendors/{uuid.uuid4()}")
        assert response.status_code == 401
