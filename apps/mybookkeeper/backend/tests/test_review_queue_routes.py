"""Route tests for the calendar review queue endpoints.

Covers:
- 401 when unauthenticated
- GET /review-queue returns list + GET /review-queue/count returns int
- POST /review-queue/{id}/resolve — happy path, 404, 409
- POST /review-queue/{id}/ignore — happy path, 404
- DELETE /review-queue/{id} — happy path, 404
- IDOR guard: resolve with wrong listing_id returns 422
"""
from __future__ import annotations

import uuid
from unittest.mock import patch, AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.calendar.review_queue_response import ReviewQueueItemResponse
from app.services.calendar import review_queue_service
from datetime import datetime, timezone


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)


def _make_item(*, status: str = "pending") -> ReviewQueueItemResponse:
    return ReviewQueueItemResponse(
        id=uuid.uuid4(),
        email_message_id="msg-abc",
        source_channel="airbnb",
        parsed_payload={
            "source_channel": "airbnb",
            "source_listing_id": "12345",
            "guest_name": "John Doe",
            "check_in": "2026-06-05",
            "check_out": "2026-06-10",
            "total_price": "$425.00",
            "raw_subject": "Reservation confirmed - John Doe",
        },
        status=status,
        created_at=datetime.now(timezone.utc),
    )


class TestListReviewQueue:
    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.get("/calendar/review-queue")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_pending_items(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        items = [_make_item(), _make_item()]
        with patch(
            "app.api.calendar.review_queue_service.list_pending_items",
            return_value=items,
        ):
            client = TestClient(app)
            response = client.get("/calendar/review-queue")

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 2
        assert body[0]["source_channel"] == "airbnb"
        app.dependency_overrides.clear()


class TestCountReviewQueue:
    @pytest.mark.asyncio
    async def test_returns_count(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.calendar.review_queue_service.count_pending_items",
            return_value=3,
        ):
            client = TestClient(app)
            response = client.get("/calendar/review-queue/count")

        assert response.status_code == 200
        assert response.json() == 3
        app.dependency_overrides.clear()


class TestResolveQueueItem:
    @pytest.mark.asyncio
    async def test_resolve_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        resolved_item = _make_item(status="resolved")
        with patch(
            "app.api.calendar.review_queue_service.resolve_item",
            return_value=resolved_item,
        ):
            client = TestClient(app)
            response = client.post(
                f"/calendar/review-queue/{item_id}/resolve",
                json={"listing_id": str(listing_id)},
            )

        assert response.status_code == 200
        assert response.json()["status"] == "resolved"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_resolve_not_found_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.calendar.review_queue_service.resolve_item",
            side_effect=review_queue_service.QueueItemNotFound("not found"),
        ):
            client = TestClient(app)
            response = client.post(
                f"/calendar/review-queue/{item_id}/resolve",
                json={"listing_id": str(listing_id)},
            )

        assert response.status_code == 404
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_resolve_already_resolved_returns_409(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.calendar.review_queue_service.resolve_item",
            side_effect=review_queue_service.QueueItemNotPending("already resolved"),
        ):
            client = TestClient(app)
            response = client.post(
                f"/calendar/review-queue/{item_id}/resolve",
                json={"listing_id": str(listing_id)},
            )

        assert response.status_code == 409
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_resolve_listing_not_found_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.calendar.review_queue_service.resolve_item",
            side_effect=review_queue_service.ListingNotFound("listing not found"),
        ):
            client = TestClient(app)
            response = client.post(
                f"/calendar/review-queue/{item_id}/resolve",
                json={"listing_id": str(listing_id)},
            )

        assert response.status_code == 422
        app.dependency_overrides.clear()


class TestIgnoreQueueItem:
    @pytest.mark.asyncio
    async def test_ignore_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        ignored_item = _make_item(status="ignored")
        with patch(
            "app.api.calendar.review_queue_service.ignore_item",
            return_value=ignored_item,
        ):
            client = TestClient(app)
            response = client.post(
                f"/calendar/review-queue/{item_id}/ignore",
                json={"source_listing_id": "12345", "reason": "Not my listing"},
            )

        assert response.status_code == 200
        assert response.json()["status"] == "ignored"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_ignore_not_found_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.calendar.review_queue_service.ignore_item",
            side_effect=review_queue_service.QueueItemNotFound("not found"),
        ):
            client = TestClient(app)
            response = client.post(
                f"/calendar/review-queue/{item_id}/ignore",
                json={"source_listing_id": "12345"},
            )

        assert response.status_code == 404
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_extra_fields_rejected(self) -> None:
        """extra='forbid' on the schema must reject unknown request fields."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        client = TestClient(app)
        response = client.post(
            f"/calendar/review-queue/{item_id}/ignore",
            json={"source_listing_id": "12345", "hacked_field": "evil"},
        )
        assert response.status_code == 422
        app.dependency_overrides.clear()


class TestDismissQueueItem:
    @pytest.mark.asyncio
    async def test_dismiss_happy_path(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.calendar.review_queue_service.dismiss_item",
            return_value=None,
        ):
            client = TestClient(app)
            response = client.delete(f"/calendar/review-queue/{item_id}")

        assert response.status_code == 204
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_dismiss_not_found_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.calendar.review_queue_service.dismiss_item",
            side_effect=review_queue_service.QueueItemNotFound("not found"),
        ):
            client = TestClient(app)
            response = client.delete(f"/calendar/review-queue/{item_id}")

        assert response.status_code == 404
        app.dependency_overrides.clear()
