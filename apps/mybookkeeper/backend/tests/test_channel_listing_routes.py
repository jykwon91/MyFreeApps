"""Route tests for the channel-listing API surface.

Auth + service layers are mocked; these tests verify the HTTP contract:
status codes, response shapes, validation, and that the route translates
service exceptions to the expected HTTP responses.
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
from app.schemas.listings.channel_listing_response import ChannelListingResponse
from app.schemas.listings.channel_response import ChannelResponse
from app.services.listings import channel_listing_service


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)


def _channel_listing_response(
    *,
    listing_id: uuid.UUID,
    channel_id: str = "airbnb",
) -> ChannelListingResponse:
    return ChannelListingResponse(
        id=str(uuid.uuid4()),
        listing_id=str(listing_id),
        channel_id=channel_id,
        channel=ChannelResponse(
            id=channel_id, name=channel_id.title(),
            supports_ical_export=True, supports_ical_import=True,
            created_at=datetime.now(timezone.utc),
        ),
        external_url="https://airbnb.com/rooms/x",
        external_id=None,
        ical_import_url=None,
        last_imported_at=None,
        last_import_error=None,
        ical_export_token="abc123token",
        ical_export_url="https://example.com/api/calendar/abc123token.ics",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


class TestCreateChannelListing:
    def test_returns_201_on_success(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        response_model = _channel_listing_response(listing_id=listing_id)

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.channel_listing_service.create_channel_listing",
                return_value=response_model,
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/channels",
                    json={
                        "channel_id": "airbnb",
                        "external_url": "https://airbnb.com/rooms/x",
                    },
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 201
        body = response.json()
        assert body["channel_id"] == "airbnb"
        assert body["ical_export_url"].startswith("https://")
        assert body["ical_export_url"].endswith(".ics")

    def test_rejects_missing_external_url(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/listings/{listing_id}/channels",
                json={"channel_id": "airbnb"},  # no external_url
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    def test_returns_404_when_listing_not_found(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.channel_listing_service.create_channel_listing",
                side_effect=channel_listing_service.ListingNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/channels",
                    json={
                        "channel_id": "airbnb",
                        "external_url": "https://airbnb.com/rooms/x",
                    },
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    def test_returns_404_when_channel_unknown(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.channel_listing_service.create_channel_listing",
                side_effect=channel_listing_service.ChannelNotFoundError("Unknown channel"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/channels",
                    json={
                        "channel_id": "unknown",
                        "external_url": "https://example.com",
                    },
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    def test_returns_409_when_already_linked(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.channel_listing_service.create_channel_listing",
                side_effect=channel_listing_service.ChannelAlreadyLinkedError("Already linked"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/channels",
                    json={
                        "channel_id": "airbnb",
                        "external_url": "https://airbnb.com/x",
                    },
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 409


class TestListChannelListings:
    def test_returns_list_on_success(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        rows = [_channel_listing_response(listing_id=listing_id)]

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.channel_listing_service.list_channels",
                return_value=rows,
            ):
                client = TestClient(app)
                response = client.get(f"/listings/{listing_id}/channels")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["channel_id"] == "airbnb"


class TestDeleteChannelListing:
    def test_returns_204_on_success(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        cl_id = uuid.uuid4()

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.channel_listing_service.delete_channel_listing",
                return_value=None,
            ):
                client = TestClient(app)
                response = client.delete(f"/channel-listings/{cl_id}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 204

    def test_returns_404_when_missing(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        cl_id = uuid.uuid4()

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.channel_listing_service.delete_channel_listing",
                side_effect=channel_listing_service.ChannelListingNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.delete(f"/channel-listings/{cl_id}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404


class TestPatchChannelListing:
    def test_returns_200_on_success(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        cl_id = uuid.uuid4()
        response_model = _channel_listing_response(listing_id=listing_id)

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.channel_listing_service.update_channel_listing",
                return_value=response_model,
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/channel-listings/{cl_id}",
                    json={"external_url": "https://airbnb.com/rooms/y"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
