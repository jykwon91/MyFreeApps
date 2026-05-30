"""API route tests for /welcome-manuals — auth + happy + 404 + validation.

Mocks the service layer (same approach as test_listing_routes).
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
from app.schemas.welcome_manuals.welcome_manual_list_response import (
    WelcomeManualListResponse,
)
from app.schemas.welcome_manuals.welcome_manual_response import WelcomeManualResponse
from app.schemas.welcome_manuals.welcome_manual_section_response import (
    WelcomeManualSectionResponse,
)
from app.schemas.welcome_manuals.welcome_manual_summary import WelcomeManualSummary
from app.services.welcome_manuals import (
    welcome_manual_section_service,
    welcome_manual_service,
)


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)


def _manual_response(
    manual_id: uuid.UUID, org_id: uuid.UUID, user_id: uuid.UUID, *, title: str = "Guide",
) -> WelcomeManualResponse:
    now = datetime.now(timezone.utc)
    return WelcomeManualResponse(
        id=manual_id,
        organization_id=org_id,
        user_id=user_id,
        property_id=None,
        title=title,
        intro_text=None,
        sections=[],
        created_at=now,
        updated_at=now,
    )


def _section_response(manual_id: uuid.UUID, *, title: str = "Wi-Fi", order: int = 0) -> WelcomeManualSectionResponse:
    now = datetime.now(timezone.utc)
    return WelcomeManualSectionResponse(
        id=uuid.uuid4(),
        manual_id=manual_id,
        title=title,
        body=None,
        display_order=order,
        created_at=now,
        updated_at=now,
    )


def _override_auth(org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
    app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)


def patch_service(name: str, **kwargs):
    """Patch a function on welcome_manual_service. The router looks the
    attribute up on the module at call time, so patching here is seen."""
    return patch.object(welcome_manual_service, name, **kwargs)


def patch_section_service(name: str, **kwargs):
    return patch.object(welcome_manual_section_service, name, **kwargs)


class TestList:
    @pytest.mark.asyncio
    async def test_returns_envelope(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        now = datetime.now(timezone.utc)
        summary = WelcomeManualSummary(
            id=uuid.uuid4(), title="Guide", property_id=None,
            section_count=5, created_at=now, updated_at=now,
        )
        envelope = WelcomeManualListResponse(items=[summary], total=1, has_more=False)
        _override_auth(org_id, user_id)
        try:
            with patch_service("list_manuals", return_value=envelope):
                client = TestClient(app)
                response = client.get("/welcome-manuals")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["section_count"] == 5

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        assert client.get("/welcome-manuals").status_code == 401


class TestCreate:
    @pytest.mark.asyncio
    async def test_creates(self) -> None:
        org_id, user_id, manual_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_service("create_manual", return_value=_manual_response(manual_id, org_id, user_id)):
                client = TestClient(app)
                response = client.post("/welcome-manuals", json={"title": "Guide"})
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 201
        assert response.json()["id"] == str(manual_id)

    @pytest.mark.asyncio
    async def test_missing_title_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post("/welcome-manuals", json={})
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_extra_fields_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                "/welcome-manuals",
                json={"title": "x", "organization_id": str(uuid.uuid4())},
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_property_not_found_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_service("create_manual", side_effect=LookupError("Property not found")):
                client = TestClient(app)
                response = client.post(
                    "/welcome-manuals",
                    json={"title": "x", "property_id": str(uuid.uuid4())},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404


class TestGetUpdateDelete:
    @pytest.mark.asyncio
    async def test_get_ok(self) -> None:
        org_id, user_id, manual_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_service("get_manual", return_value=_manual_response(manual_id, org_id, user_id)):
                client = TestClient(app)
                response = client.get(f"/welcome-manuals/{manual_id}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        assert response.json()["id"] == str(manual_id)

    @pytest.mark.asyncio
    async def test_get_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_service("get_manual", side_effect=LookupError("nope")):
                client = TestClient(app)
                response = client.get(f"/welcome-manuals/{uuid.uuid4()}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404
        assert response.json()["detail"] == "Welcome manual not found"

    @pytest.mark.asyncio
    async def test_update_ok(self) -> None:
        org_id, user_id, manual_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_service(
                "update_manual",
                return_value=_manual_response(manual_id, org_id, user_id, title="New"),
            ):
                client = TestClient(app)
                response = client.put(f"/welcome-manuals/{manual_id}", json={"title": "New"})
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        assert response.json()["title"] == "New"

    @pytest.mark.asyncio
    async def test_update_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_service("update_manual", side_effect=LookupError("nope")):
                client = TestClient(app)
                response = client.put(f"/welcome-manuals/{uuid.uuid4()}", json={"title": "x"})
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_204(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_service("soft_delete_manual", return_value=None):
                client = TestClient(app)
                response = client.delete(f"/welcome-manuals/{uuid.uuid4()}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_service("soft_delete_manual", side_effect=LookupError("nope")):
                client = TestClient(app)
                response = client.delete(f"/welcome-manuals/{uuid.uuid4()}")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404


class TestSections:
    @pytest.mark.asyncio
    async def test_add_section_201(self) -> None:
        org_id, user_id, manual_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_section_service("add_section", return_value=_section_response(manual_id)):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections",
                    json={"title": "Wi-Fi", "body": "net/pass"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 201
        assert response.json()["title"] == "Wi-Fi"

    @pytest.mark.asyncio
    async def test_add_section_manual_404(self) -> None:
        org_id, user_id, manual_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_section_service(
                "add_section",
                side_effect=welcome_manual_section_service.ManualNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections", json={"title": "x"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_add_section_too_many_409(self) -> None:
        org_id, user_id, manual_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_section_service(
                "add_section",
                side_effect=welcome_manual_section_service.TooManySectionsError("too many"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections", json={"title": "x"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_update_section_ok(self) -> None:
        org_id, user_id, manual_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_section_service(
                "update_section",
                return_value=_section_response(manual_id, title="Renamed"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/welcome-manuals/{manual_id}/sections/{uuid.uuid4()}",
                    json={"title": "Renamed"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        assert response.json()["title"] == "Renamed"

    @pytest.mark.asyncio
    async def test_update_section_404(self) -> None:
        org_id, user_id, manual_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_section_service(
                "update_section",
                side_effect=welcome_manual_section_service.SectionNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/welcome-manuals/{manual_id}/sections/{uuid.uuid4()}",
                    json={"title": "x"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_section_204(self) -> None:
        org_id, user_id, manual_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_section_service("delete_section", return_value=None):
                client = TestClient(app)
                response = client.delete(
                    f"/welcome-manuals/{manual_id}/sections/{uuid.uuid4()}",
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_reorder_ok(self) -> None:
        org_id, user_id, manual_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        ids = [uuid.uuid4(), uuid.uuid4()]
        _override_auth(org_id, user_id)
        try:
            with patch_section_service(
                "reorder_sections",
                return_value=[_section_response(manual_id, order=0), _section_response(manual_id, order=1)],
            ):
                client = TestClient(app)
                response = client.put(
                    f"/welcome-manuals/{manual_id}/sections/order",
                    json={"section_ids": [str(i) for i in ids]},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        assert len(response.json()) == 2

    @pytest.mark.asyncio
    async def test_reorder_invalid_400(self) -> None:
        org_id, user_id, manual_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        _override_auth(org_id, user_id)
        try:
            with patch_section_service(
                "reorder_sections",
                side_effect=welcome_manual_section_service.InvalidReorderError("bad"),
            ):
                client = TestClient(app)
                response = client.put(
                    f"/welcome-manuals/{manual_id}/sections/order",
                    json={"section_ids": [str(uuid.uuid4())]},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 400
