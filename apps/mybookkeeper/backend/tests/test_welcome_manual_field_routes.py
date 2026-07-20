"""API route tests for welcome-manual section fields. Mocks the service layer."""
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
from app.schemas.welcome_manuals.welcome_manual_section_field_response import (
    WelcomeManualSectionFieldResponse,
)
from app.services.welcome_manuals import welcome_manual_section_field_service


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)


def _override_auth(org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
    app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)


def _field_response(section_id: uuid.UUID, *, order: int = 0, label: str = "Network name", value: str | None = None) -> WelcomeManualSectionFieldResponse:
    return WelcomeManualSectionFieldResponse(
        id=uuid.uuid4(),
        section_id=section_id,
        label=label,
        value=value,
        display_order=order,
        created_at=datetime.now(timezone.utc),
    )


def patch_field_service(name: str, **kwargs):
    return patch.object(welcome_manual_section_field_service, name, **kwargs)


class TestAdd:
    @pytest.mark.asyncio
    async def test_add_201(self) -> None:
        org_id, user_id, manual_id, section_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_field_service("add_field", return_value=_field_response(section_id, value="v")):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/fields",
                    json={"label": "Network name", "value": "v"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 201
        body = response.json()
        assert body["label"] == "Network name"
        assert body["value"] == "v"

    @pytest.mark.asyncio
    async def test_add_manual_404(self) -> None:
        org_id, user_id, manual_id, section_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_field_service(
                "add_field",
                side_effect=welcome_manual_section_field_service.ManualNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/fields",
                    json={"label": "L"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_add_section_404(self) -> None:
        org_id, user_id, manual_id, section_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_field_service(
                "add_field",
                side_effect=welcome_manual_section_field_service.SectionNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/fields",
                    json={"label": "L"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_add_too_many_409(self) -> None:
        org_id, user_id, manual_id, section_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_field_service(
                "add_field",
                side_effect=welcome_manual_section_field_service.TooManyFieldsError("too many"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/fields",
                    json={"label": "L"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 409


class TestUpdateDelete:
    @pytest.mark.asyncio
    async def test_update_200(self) -> None:
        org_id, user_id, manual_id, section_id, field_id = (uuid.uuid4() for _ in range(5))
        _override_auth(org_id, user_id)
        try:
            with patch_field_service(
                "update_field",
                return_value=_field_response(section_id, label="renamed"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/fields/{field_id}",
                    json={"label": "renamed"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        assert response.json()["label"] == "renamed"

    @pytest.mark.asyncio
    async def test_update_field_404(self) -> None:
        org_id, user_id, manual_id, section_id, field_id = (uuid.uuid4() for _ in range(5))
        _override_auth(org_id, user_id)
        try:
            with patch_field_service(
                "update_field",
                side_effect=welcome_manual_section_field_service.FieldNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/fields/{field_id}",
                    json={"value": "x"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_204(self) -> None:
        org_id, user_id, manual_id, section_id, field_id = (uuid.uuid4() for _ in range(5))
        _override_auth(org_id, user_id)
        try:
            with patch_field_service("delete_field", return_value=None):
                client = TestClient(app)
                response = client.delete(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/fields/{field_id}",
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_field_404(self) -> None:
        org_id, user_id, manual_id, section_id, field_id = (uuid.uuid4() for _ in range(5))
        _override_auth(org_id, user_id)
        try:
            with patch_field_service(
                "delete_field",
                side_effect=welcome_manual_section_field_service.FieldNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.delete(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/fields/{field_id}",
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404
