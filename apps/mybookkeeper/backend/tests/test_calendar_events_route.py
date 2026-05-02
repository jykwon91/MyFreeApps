"""Route tests for ``GET /calendar/events`` (the authenticated viewer).

Covers:
- 401 when unauthenticated
- 200 happy path passes filters through to the service
- 400 on malformed UUIDs in CSV filters
- 422 on oversize windows
- 422 on inverted windows
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.calendar.calendar_event_response import CalendarEventResponse
from app.services.calendar import calendar_service


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)


def _make_event(*, source: str = "airbnb") -> CalendarEventResponse:
    return CalendarEventResponse(
        id=uuid.uuid4(),
        listing_id=uuid.uuid4(),
        listing_name="Master Bedroom",
        property_id=uuid.uuid4(),
        property_name="Med Center House",
        starts_on=date(2026, 6, 5),
        ends_on=date(2026, 6, 10),
        source=source,
        source_event_id="uid-1",
        summary=None,
        updated_at=datetime.now(timezone.utc),
    )


class TestCalendarEventsEndpoint:
    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.get("/calendar/events")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_events(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        events = [_make_event()]
        with patch(
            "app.api.calendar.calendar_service.list_events",
            return_value=events,
        ):
            client = TestClient(app)
            response = client.get(
                "/calendar/events?from=2026-06-01&to=2026-07-01",
            )

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 1
        assert body[0]["source"] == "airbnb"
        assert body[0]["listing_name"] == "Master Bedroom"
        assert body[0]["property_name"] == "Med Center House"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_filter_csv_passes_through_to_service(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        listing_a = uuid.uuid4()
        listing_b = uuid.uuid4()
        property_a = uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.calendar.calendar_service.list_events",
            return_value=[],
        ) as mock_list:
            client = TestClient(app)
            response = client.get(
                "/calendar/events"
                f"?from=2026-06-01&to=2026-07-01"
                f"&listing_ids={listing_a},{listing_b}"
                f"&property_ids={property_a}"
                f"&sources=airbnb,vrbo",
            )

        assert response.status_code == 200
        kwargs = mock_list.call_args.kwargs
        assert kwargs["listing_ids"] == [listing_a, listing_b]
        assert kwargs["property_ids"] == [property_a]
        assert kwargs["sources"] == ["airbnb", "vrbo"]
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_default_window_when_dates_omitted(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.calendar.calendar_service.list_events",
            return_value=[],
        ) as mock_list:
            client = TestClient(app)
            response = client.get("/calendar/events")

        assert response.status_code == 200
        kwargs = mock_list.call_args.kwargs
        # Service is responsible for applying defaults — route just passes None through.
        assert kwargs["from_"] is None
        assert kwargs["to"] is None
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_invalid_uuid_in_listing_ids_returns_400(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        client = TestClient(app)
        response = client.get(
            "/calendar/events?from=2026-06-01&to=2026-07-01&listing_ids=not-a-uuid",
        )
        assert response.status_code == 400
        assert "listing_ids" in response.json()["detail"]
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_invalid_date_format_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        client = TestClient(app)
        response = client.get("/calendar/events?from=not-a-date")
        # FastAPI rejects bad date types as 422 (input validation).
        assert response.status_code == 422
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_inverted_window_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        # Real service raises CalendarWindowError → route translates to 422.
        with patch(
            "app.api.calendar.calendar_service.list_events",
            side_effect=calendar_service.CalendarWindowError("`from` must be strictly before `to`"),
        ):
            client = TestClient(app)
            response = client.get(
                "/calendar/events?from=2026-07-01&to=2026-06-01",
            )

        assert response.status_code == 422
        assert "from" in response.json()["detail"]
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_oversize_window_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)

        with patch(
            "app.api.calendar.calendar_service.list_events",
            side_effect=calendar_service.CalendarWindowError("Window exceeds 365 days; narrow the range"),
        ):
            client = TestClient(app)
            response = client.get(
                "/calendar/events?from=2025-01-01&to=2027-01-01",
            )

        assert response.status_code == 422
        assert "365" in response.json()["detail"]
        app.dependency_overrides.clear()
