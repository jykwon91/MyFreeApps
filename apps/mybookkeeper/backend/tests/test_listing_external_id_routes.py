"""API route tests for the external-ID linkage endpoints (PR 1.3).

The route handlers are thin wrappers — they translate service exceptions to
HTTP status codes and validate request bodies via Pydantic. These tests
verify the contract: status codes, validation rejection, conflict
surfacing, and that the cross-org isolation contract is honoured (a
listing in another org → 404, never 200).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.listings.listing_external_id_response import ListingExternalIdResponse
from app.services.listings import listing_external_id_service


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)


def _ext_response(
    *, listing_id: uuid.UUID, source: str = "FF",
    external_id: str | None = "FF-1",
    external_url: str | None = "https://furnishedfinder.com/property/FF-1",
) -> ListingExternalIdResponse:
    return ListingExternalIdResponse(
        id=uuid.uuid4(),
        listing_id=listing_id,
        source=source,
        external_id=external_id,
        external_url=external_url,
        created_at=datetime.now(timezone.utc),
    )


class TestCreateExternalIdEndpoint:
    @pytest.mark.asyncio
    async def test_returns_201_on_success(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        response_model = _ext_response(listing_id=listing_id)

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_external_id_service.create_external_id",
                return_value=response_model,
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/external-ids",
                    json={
                        "source": "FF",
                        "external_id": "FF-1",
                        "external_url": "https://furnishedfinder.com/property/FF-1",
                    },
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 201
        body = response.json()
        assert body["source"] == "FF"
        assert body["external_id"] == "FF-1"

    @pytest.mark.asyncio
    async def test_rejects_invalid_source(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/listings/{listing_id}/external-ids",
                json={"source": "Vrbo", "external_id": "v-1"},  # invalid source
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_rejects_when_both_external_id_and_url_are_null(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/listings/{listing_id}/external-ids",
                json={"source": "FF"},  # no id, no url
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_rejects_non_http_url(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/listings/{listing_id}/external-ids",
                json={
                    "source": "FF",
                    "external_url": "javascript:alert(1)",  # malicious / non-http
                },
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_rejects_extra_fields(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/listings/{listing_id}/external-ids",
                json={
                    "source": "FF",
                    "external_id": "FF-1",
                    "listing_id": str(uuid.uuid4()),  # client trying to override
                },
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_returns_404_on_listing_not_found(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_external_id_service.create_external_id",
                side_effect=listing_external_id_service.ListingNotFoundError("x"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/external-ids",
                    json={"source": "FF", "external_id": "FF-1"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_409_on_source_already_linked(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_external_id_service.create_external_id",
                side_effect=listing_external_id_service.SourceAlreadyLinkedError(
                    "This listing is already linked to FF.",
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/external-ids",
                    json={"source": "FF", "external_id": "FF-A"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 409
        assert "already linked to FF" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_returns_409_on_external_id_already_claimed(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_external_id_service.create_external_id",
                side_effect=listing_external_id_service.ExternalIdAlreadyClaimedError(
                    "This FF ID is already linked to another listing.",
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/external-ids",
                    json={"source": "FF", "external_id": "FF-7"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 409
        assert "already linked to another listing" in response.json()["detail"]


class TestUpdateExternalIdEndpoint:
    @pytest.mark.asyncio
    async def test_updates_url(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        ext_pk = uuid.uuid4()
        response_model = _ext_response(
            listing_id=listing_id,
            external_url="https://new.example.com/x",
        )

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_external_id_service.update_external_id",
                return_value=response_model,
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/listings/{listing_id}/external-ids/{ext_pk}",
                    json={"external_url": "https://new.example.com/x"},
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["external_url"] == "https://new.example.com/x"

    @pytest.mark.asyncio
    async def test_rejects_source_change_attempt(self) -> None:
        """`source` is not in the update schema's allowed fields. Pydantic
        `extra='forbid'` rejects the body."""
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        ext_pk = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.patch(
                f"/listings/{listing_id}/external-ids/{ext_pk}",
                json={"source": "TNH"},  # blocked by extra='forbid'
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_returns_404_on_listing_not_found(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        ext_pk = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_external_id_service.update_external_id",
                side_effect=listing_external_id_service.ListingNotFoundError("x"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/listings/{listing_id}/external-ids/{ext_pk}",
                    json={"external_id": "y"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_404_on_external_id_not_found(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        ext_pk = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_external_id_service.update_external_id",
                side_effect=listing_external_id_service.ExternalIdNotFoundError("x"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/listings/{listing_id}/external-ids/{ext_pk}",
                    json={"external_id": "y"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_409_on_collision(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        ext_pk = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_external_id_service.update_external_id",
                side_effect=listing_external_id_service.ExternalIdAlreadyClaimedError(
                    "This FF ID is already linked to another listing.",
                ),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/listings/{listing_id}/external-ids/{ext_pk}",
                    json={"external_id": "FF-7"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 409


class TestDeleteExternalIdEndpoint:
    @pytest.mark.asyncio
    async def test_returns_204_on_success(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        ext_pk = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_external_id_service.delete_external_id",
                return_value=None,
            ):
                client = TestClient(app)
                response = client.delete(
                    f"/listings/{listing_id}/external-ids/{ext_pk}",
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_returns_404_on_listing_not_found(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        ext_pk = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_external_id_service.delete_external_id",
                side_effect=listing_external_id_service.ListingNotFoundError("x"),
            ):
                client = TestClient(app)
                response = client.delete(
                    f"/listings/{listing_id}/external-ids/{ext_pk}",
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_404_on_external_id_not_found(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        ext_pk = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_external_id_service.delete_external_id",
                side_effect=listing_external_id_service.ExternalIdNotFoundError("x"),
            ):
                client = TestClient(app)
                response = client.delete(
                    f"/listings/{listing_id}/external-ids/{ext_pk}",
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404


class TestUnauthenticated:
    def test_post_without_auth_returns_401(self) -> None:
        client = TestClient(app)
        response = client.post(
            f"/listings/{uuid.uuid4()}/external-ids",
            json={"source": "FF", "external_id": "x"},
        )
        assert response.status_code == 401
