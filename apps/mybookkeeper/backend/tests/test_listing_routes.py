"""API route tests for /listings — auth + happy + 404 + tenant isolation."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.listings.listing_list_response import ListingListResponse
from app.schemas.listings.listing_photo_response import ListingPhotoResponse
from app.schemas.listings.listing_response import ListingResponse
from app.schemas.listings.listing_summary import ListingSummary


class TestListingsListEndpoint:
    def _ctx(self, org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
        return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)

    @pytest.mark.asyncio
    async def test_get_returns_summaries(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        prop_id = uuid.uuid4()
        listing_id = uuid.uuid4()

        summary = ListingSummary(
            id=listing_id,
            title="Master Bedroom",
            status="active",
            room_type="private_room",
            monthly_rate=Decimal("1500.00"),
            property_id=prop_id,
            created_at=datetime.now(timezone.utc),
        )
        envelope = ListingListResponse(items=[summary], total=1, has_more=False)

        app.dependency_overrides[current_org_member] = lambda: self._ctx(org_id, user_id)
        with patch(
            "app.api.listings.listing_service.list_listings",
            return_value=envelope,
        ):
            client = TestClient(app)
            response = client.get("/listings")

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, dict)
        assert body["total"] == 1
        assert body["has_more"] is False
        assert len(body["items"]) == 1
        assert body["items"][0]["id"] == str(listing_id)
        assert body["items"][0]["status"] == "active"

        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_status_filter_passes_through(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: self._ctx(org_id, user_id)

        empty = ListingListResponse(items=[], total=0, has_more=False)
        with patch(
            "app.api.listings.listing_service.list_listings",
            return_value=empty,
        ) as mock_list:
            client = TestClient(app)
            response = client.get("/listings?status=archived&limit=10&offset=5")

        assert response.status_code == 200
        mock_list.assert_called_once()
        kwargs = mock_list.call_args.kwargs
        assert kwargs["status"] == "archived"
        assert kwargs["limit"] == 10
        assert kwargs["offset"] == 5
        app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.get("/listings")
        # No auth → fastapi-users returns 401 (no bearer token).
        assert response.status_code == 401


class TestListingDetailEndpoint:
    def _ctx(self, org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
        return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)

    @pytest.mark.asyncio
    async def test_returns_full_payload(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        prop_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        full = ListingResponse(
            id=listing_id,
            organization_id=org_id,
            user_id=user_id,
            property_id=prop_id,
            title="Master Bedroom",
            description=None,
            monthly_rate=Decimal("1500.00"),
            weekly_rate=None,
            nightly_rate=None,
            min_stay_days=None,
            max_stay_days=None,
            room_type="private_room",
            private_bath=False,
            parking_assigned=False,
            furnished=True,
            status="active",
            amenities=["wifi"],
            pets_on_premises=False,
            large_dog_disclosure=None,
            photos=[],
            external_ids=[],
            created_at=now,
            updated_at=now,
        )

        app.dependency_overrides[current_org_member] = lambda: self._ctx(org_id, user_id)
        with patch(
            "app.api.listings.listing_service.get_listing",
            return_value=full,
        ):
            client = TestClient(app)
            response = client.get(f"/listings/{listing_id}")

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(listing_id)
        assert body["amenities"] == ["wifi"]
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_returns_404_when_service_raises_lookup_error(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: self._ctx(org_id, user_id)

        with patch(
            "app.api.listings.listing_service.get_listing",
            side_effect=LookupError("Listing not found"),
        ):
            client = TestClient(app)
            response = client.get(f"/listings/{uuid.uuid4()}")

        assert response.status_code == 404
        assert response.json()["detail"] == "Listing not found"
        app.dependency_overrides.clear()


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)


def _full_response(
    listing_id: uuid.UUID, org_id: uuid.UUID, user_id: uuid.UUID, prop_id: uuid.UUID,
    *, title: str = "Master Bedroom",
) -> ListingResponse:
    now = datetime.now(timezone.utc)
    return ListingResponse(
        id=listing_id,
        organization_id=org_id,
        user_id=user_id,
        property_id=prop_id,
        title=title,
        description=None,
        monthly_rate=Decimal("1500.00"),
        weekly_rate=None,
        nightly_rate=None,
        min_stay_days=None,
        max_stay_days=None,
        room_type="private_room",
        private_bath=False,
        parking_assigned=False,
        furnished=True,
        status="active",
        amenities=[],
        pets_on_premises=False,
        large_dog_disclosure=None,
        photos=[],
        external_ids=[],
        created_at=now,
        updated_at=now,
    )


class TestListingCreateEndpoint:
    @pytest.mark.asyncio
    async def test_creates_with_minimal_payload(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        prop_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        response_model = _full_response(listing_id, org_id, user_id, prop_id)

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_service.create_listing",
                return_value=response_model,
            ):
                client = TestClient(app)
                response = client.post(
                    "/listings",
                    json={
                        "property_id": str(prop_id),
                        "title": "Master Bedroom",
                        "monthly_rate": "1500.00",
                        "room_type": "private_room",
                    },
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 201
        assert response.json()["id"] == str(listing_id)

    @pytest.mark.asyncio
    async def test_rejects_invalid_room_type(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        prop_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                "/listings",
                json={
                    "property_id": str(prop_id),
                    "title": "x",
                    "monthly_rate": "1500",
                    "room_type": "mansion",  # invalid
                },
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_rejects_negative_monthly_rate(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        prop_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                "/listings",
                json={
                    "property_id": str(prop_id),
                    "title": "x",
                    "monthly_rate": "-1.00",
                    "room_type": "private_room",
                },
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_rejects_min_stay_greater_than_max_stay(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        prop_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                "/listings",
                json={
                    "property_id": str(prop_id),
                    "title": "x",
                    "monthly_rate": "1500",
                    "room_type": "private_room",
                    "min_stay_days": 30,
                    "max_stay_days": 14,
                },
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_rejects_oversized_amenities_array(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        prop_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                "/listings",
                json={
                    "property_id": str(prop_id),
                    "title": "x",
                    "monthly_rate": "1500",
                    "room_type": "private_room",
                    "amenities": [f"a{i}" for i in range(60)],  # > 50
                },
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_rejects_extra_fields(self) -> None:
        """`extra='forbid'` defends against a malicious client trying to inject
        organization_id or user_id via the body."""
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        prop_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                "/listings",
                json={
                    "property_id": str(prop_id),
                    "title": "x",
                    "monthly_rate": "1500",
                    "room_type": "private_room",
                    "organization_id": str(uuid.uuid4()),  # rejected
                },
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_returns_404_when_property_not_found(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        prop_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_service.create_listing",
                side_effect=LookupError("Property not found"),
            ):
                client = TestClient(app)
                response = client.post(
                    "/listings",
                    json={
                        "property_id": str(prop_id),
                        "title": "x",
                        "monthly_rate": "1500",
                        "room_type": "private_room",
                    },
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404


class TestListingUpdateEndpoint:
    @pytest.mark.asyncio
    async def test_updates_partial(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        prop_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        response_model = _full_response(listing_id, org_id, user_id, prop_id, title="New Title")

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_service.update_listing",
                return_value=response_model,
            ):
                client = TestClient(app)
                response = client.put(
                    f"/listings/{listing_id}",
                    json={"title": "New Title"},
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["title"] == "New Title"

    @pytest.mark.asyncio
    async def test_returns_404_when_service_raises(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_service.update_listing",
                side_effect=LookupError("Listing not found"),
            ):
                client = TestClient(app)
                response = client.put(
                    f"/listings/{listing_id}",
                    json={"title": "x"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404


class TestListingDeleteEndpoint:
    @pytest.mark.asyncio
    async def test_returns_204_on_success(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_service.soft_delete_listing",
                return_value=None,
            ):
                client = TestClient(app)
                response = client.delete(f"/listings/{listing_id}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_returns_404_when_already_deleted(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_service.soft_delete_listing",
                side_effect=LookupError("Listing not found"),
            ):
                client = TestClient(app)
                response = client.delete(f"/listings/{listing_id}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404


class TestListingPhotoUploadEndpoint:
    @pytest.mark.asyncio
    async def test_accepts_valid_image(self) -> None:
        from PIL import Image
        import io as _io

        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()

        # Build a tiny valid JPEG so the byte stream survives FastAPI parsing.
        img = Image.new("RGB", (16, 16), color=(50, 80, 120))
        buf = _io.BytesIO()
        img.save(buf, format="JPEG")
        jpeg_bytes = buf.getvalue()

        photo_response = ListingPhotoResponse(
            id=uuid.uuid4(),
            listing_id=listing_id,
            storage_key="org/abc/photo.jpg",
            caption=None,
            display_order=0,
            created_at=datetime.now(timezone.utc),
        )

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_photo_service.upload_photos",
                return_value=[photo_response],
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/photos",
                    files=[("files", ("test.jpg", jpeg_bytes, "image/jpeg"))],
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 201
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 1
        assert body[0]["display_order"] == 0

    @pytest.mark.asyncio
    async def test_returns_404_when_listing_not_found(self) -> None:
        from PIL import Image
        import io as _io
        from app.services.listings.listing_photo_service import ListingNotFoundError

        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        img = Image.new("RGB", (8, 8))
        buf = _io.BytesIO()
        img.save(buf, format="JPEG")
        jpeg = buf.getvalue()

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_photo_service.upload_photos",
                side_effect=ListingNotFoundError("Listing not found"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/photos",
                    files=[("files", ("test.jpg", jpeg, "image/jpeg"))],
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_415_for_unsupported_format(self) -> None:
        from app.services.storage.image_processor import ImageRejected

        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_photo_service.upload_photos",
                side_effect=ImageRejected("unsupported file type"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/photos",
                    files=[("files", ("doc.pdf", b"%PDF-1.7\n", "application/pdf"))],
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 415

    @pytest.mark.asyncio
    async def test_returns_413_for_oversized_file(self) -> None:
        from app.services.storage.image_processor import ImageRejected

        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_photo_service.upload_photos",
                side_effect=ImageRejected("file exceeds 10MB limit"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/listings/{listing_id}/photos",
                    files=[("files", ("big.jpg", b"\xff\xd8\xff" + b"\x00" * 100, "image/jpeg"))],
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 413


class TestListingPhotoPatchEndpoint:
    @pytest.mark.asyncio
    async def test_updates_caption_and_display_order(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        photo_id = uuid.uuid4()

        photo = ListingPhotoResponse(
            id=photo_id,
            listing_id=listing_id,
            storage_key="x",
            caption="renamed",
            display_order=2,
            created_at=datetime.now(timezone.utc),
        )

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_photo_service.update_photo",
                return_value=photo,
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/listings/{listing_id}/photos/{photo_id}",
                    json={"caption": "renamed", "display_order": 2},
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        body = response.json()
        assert body["caption"] == "renamed"
        assert body["display_order"] == 2


class TestListingPhotoDeleteEndpoint:
    @pytest.mark.asyncio
    async def test_returns_204_on_success(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        photo_id = uuid.uuid4()

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.listings.listing_photo_service.delete_photo",
                return_value=None,
            ):
                client = TestClient(app)
                response = client.delete(f"/listings/{listing_id}/photos/{photo_id}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 204
