"""API route tests for welcome-manual places. Mocks the service layer."""
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
from app.schemas.welcome_manuals.welcome_manual_place_response import (
    WelcomeManualPlaceResponse,
)
from app.services.welcome_manuals import welcome_manual_place_service


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)


def _override_auth(org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
    app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)


def _place_response(
    manual_id: uuid.UUID,
    *,
    order: int = 0,
    name: str = "Taco Spot",
    cuisine: str = "Mexican",
    price_tier: str | None = None,
) -> WelcomeManualPlaceResponse:
    return WelcomeManualPlaceResponse(
        id=uuid.uuid4(),
        manual_id=manual_id,
        name=name,
        cuisine=cuisine,
        price_tier=price_tier,
        note=None,
        map_url=None,
        display_order=order,
        created_at=datetime.now(timezone.utc),
    )


def patch_place_service(name: str, **kwargs):
    return patch.object(welcome_manual_place_service, name, **kwargs)


class TestAdd:
    @pytest.mark.asyncio
    async def test_add_201(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            with patch_place_service("add_place", return_value=_place_response(manual_id, price_tier="$$")):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/places",
                    json={"name": "Taco Spot", "cuisine": "Mexican", "price_tier": "$$"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Taco Spot"
        assert body["cuisine"] == "Mexican"
        assert body["price_tier"] == "$$"

    @pytest.mark.asyncio
    async def test_add_invalid_price_tier_422(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/welcome-manuals/{manual_id}/places",
                json={"name": "Taco Spot", "cuisine": "Mexican", "price_tier": "$$$$"},
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_add_non_http_map_url_422(self) -> None:
        """A stored ``javascript:`` scheme would become an href — reject at the
        validation boundary before it can reach the guest-facing directory."""
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/welcome-manuals/{manual_id}/places",
                json={
                    "name": "Taco Spot",
                    "cuisine": "Mexican",
                    "map_url": "javascript:alert(1)",
                },
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_add_manual_404(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            with patch_place_service(
                "add_place",
                side_effect=welcome_manual_place_service.ManualNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/places",
                    json={"name": "Taco Spot", "cuisine": "Mexican"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_add_too_many_409(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            with patch_place_service(
                "add_place",
                side_effect=welcome_manual_place_service.TooManyPlacesError("too many"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/places",
                    json={"name": "Taco Spot", "cuisine": "Mexican"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 409


class TestUpdateDelete:
    @pytest.mark.asyncio
    async def test_update_200(self) -> None:
        org_id, user_id, manual_id, place_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_place_service(
                "update_place",
                return_value=_place_response(manual_id, name="renamed"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/welcome-manuals/{manual_id}/places/{place_id}",
                    json={"name": "renamed"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        assert response.json()["name"] == "renamed"

    @pytest.mark.asyncio
    async def test_update_null_display_order_is_noop_not_500(self) -> None:
        """An explicit ``display_order: null`` must be dropped (the column is
        NOT NULL) rather than flow through to a NOT NULL IntegrityError -> 500.
        The service should be called with a fields dict that omits it."""
        org_id, user_id, manual_id, place_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_place_service(
                "update_place",
                return_value=_place_response(manual_id, name="renamed"),
            ) as mock_update:
                client = TestClient(app)
                response = client.patch(
                    f"/welcome-manuals/{manual_id}/places/{place_id}",
                    json={"name": "renamed", "display_order": None},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        fields = mock_update.call_args.kwargs.get("fields", mock_update.call_args.args[-1])
        assert "display_order" not in fields
        assert fields["name"] == "renamed"

    @pytest.mark.asyncio
    async def test_update_manual_404(self) -> None:
        org_id, user_id, manual_id, place_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_place_service(
                "update_place",
                side_effect=welcome_manual_place_service.ManualNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/welcome-manuals/{manual_id}/places/{place_id}",
                    json={"name": "x"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_place_404(self) -> None:
        org_id, user_id, manual_id, place_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_place_service(
                "update_place",
                side_effect=welcome_manual_place_service.PlaceNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/welcome-manuals/{manual_id}/places/{place_id}",
                    json={"note": "x"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_204(self) -> None:
        org_id, user_id, manual_id, place_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_place_service("delete_place", return_value=None):
                client = TestClient(app)
                response = client.delete(
                    f"/welcome-manuals/{manual_id}/places/{place_id}",
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_place_404(self) -> None:
        org_id, user_id, manual_id, place_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_place_service(
                "delete_place",
                side_effect=welcome_manual_place_service.PlaceNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.delete(
                    f"/welcome-manuals/{manual_id}/places/{place_id}",
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404
