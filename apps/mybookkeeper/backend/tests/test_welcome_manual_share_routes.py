"""API route tests for the welcome-manual share-link endpoints (authed side).

Mocks the service layer — same pattern as test_welcome_manual_place_routes.py.
"""
from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.welcome_manuals.welcome_manual_share_response import (
    WelcomeManualShareResponse,
)
from app.services.welcome_manuals import welcome_manual_share_service


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)


def _override_auth(org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
    app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)


def _share_response(token: str = "tok-abc", pin: str = "1234") -> WelcomeManualShareResponse:
    return WelcomeManualShareResponse(
        share_token=token, share_path=f"/guide/{token}", share_pin=pin,
    )


def patch_share_service(name: str, **kwargs):
    return patch.object(welcome_manual_share_service, name, **kwargs)


class TestEnableShare:
    @pytest.mark.asyncio
    async def test_enable_200(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            with patch_share_service("enable_share", return_value=_share_response()):
                client = TestClient(app)
                response = client.post(f"/welcome-manuals/{manual_id}/share")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        body = response.json()
        assert body["share_token"] == "tok-abc"
        assert body["share_path"] == "/guide/tok-abc"
        assert body["share_pin"] == "1234"

    @pytest.mark.asyncio
    async def test_enable_manual_404(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            with patch_share_service(
                "enable_share",
                side_effect=welcome_manual_share_service.ManualNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.post(f"/welcome-manuals/{manual_id}/share")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404


class TestRotatePin:
    @pytest.mark.asyncio
    async def test_rotate_200(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            with patch_share_service(
                "rotate_pin", return_value=_share_response(pin="9999"),
            ):
                client = TestClient(app)
                response = client.patch(f"/welcome-manuals/{manual_id}/share", json={})
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        assert response.json()["share_pin"] == "9999"

    @pytest.mark.asyncio
    async def test_rotate_with_explicit_pin(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            with patch_share_service(
                "rotate_pin", return_value=_share_response(pin="1111"),
            ) as mock_rotate:
                client = TestClient(app)
                response = client.patch(
                    f"/welcome-manuals/{manual_id}/share", json={"pin": "1111"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        assert mock_rotate.call_args.args[-1] == "1111"

    @pytest.mark.asyncio
    async def test_rotate_invalid_pin_format_422(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.patch(
                f"/welcome-manuals/{manual_id}/share", json={"pin": "12"},
            )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_rotate_manual_404(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            with patch_share_service(
                "rotate_pin",
                side_effect=welcome_manual_share_service.ManualNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.patch(f"/welcome-manuals/{manual_id}/share", json={})
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_rotate_not_shared_404(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            with patch_share_service(
                "rotate_pin",
                side_effect=welcome_manual_share_service.ShareNotEnabledError("nope"),
            ):
                client = TestClient(app)
                response = client.patch(f"/welcome-manuals/{manual_id}/share", json={})
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404


class TestRevoke:
    @pytest.mark.asyncio
    async def test_revoke_204(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            with patch_share_service("revoke_share", return_value=None):
                client = TestClient(app)
                response = client.delete(f"/welcome-manuals/{manual_id}/share")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_revoke_manual_404(self) -> None:
        org_id, user_id, manual_id = (uuid.uuid4() for _ in range(3))
        _override_auth(org_id, user_id)
        try:
            with patch_share_service(
                "revoke_share",
                side_effect=welcome_manual_share_service.ManualNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.delete(f"/welcome-manuals/{manual_id}/share")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404
