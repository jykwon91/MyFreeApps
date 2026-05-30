"""API route tests for welcome-manual section images. Mocks the service layer."""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.welcome_manuals.welcome_manual_section_image_response import (
    WelcomeManualSectionImageResponse,
)
from app.services.welcome_manuals import (
    welcome_manual_section_image_service,
    welcome_manual_section_service,
)


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)


def _override_auth(org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
    app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)


def _jpeg_bytes() -> bytes:
    img = Image.new("RGB", (8, 8), (1, 2, 3))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _image_response(section_id: uuid.UUID, *, order: int = 0, caption: str | None = None) -> WelcomeManualSectionImageResponse:
    return WelcomeManualSectionImageResponse(
        id=uuid.uuid4(),
        section_id=section_id,
        storage_key="org/welcome-manuals/x/a.jpg",
        caption=caption,
        display_order=order,
        created_at=datetime.now(timezone.utc),
        presigned_url="https://signed/a.jpg",
        is_available=True,
    )


def patch_image_service(name: str, **kwargs):
    return patch.object(welcome_manual_section_image_service, name, **kwargs)


class TestUpload:
    @pytest.mark.asyncio
    async def test_upload_201(self) -> None:
        org_id, user_id, manual_id, section_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_image_service("upload_images", return_value=[_image_response(section_id)]):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/images",
                    files=[("files", ("a.jpg", _jpeg_bytes(), "image/jpeg"))],
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 201
        body = response.json()
        assert len(body) == 1
        assert body[0]["presigned_url"] == "https://signed/a.jpg"

    @pytest.mark.asyncio
    async def test_upload_manual_404(self) -> None:
        org_id, user_id, manual_id, section_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_image_service(
                "upload_images",
                side_effect=welcome_manual_section_service.ManualNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/images",
                    files=[("files", ("a.jpg", _jpeg_bytes(), "image/jpeg"))],
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_upload_section_404(self) -> None:
        org_id, user_id, manual_id, section_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_image_service(
                "upload_images",
                side_effect=welcome_manual_section_service.SectionNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/images",
                    files=[("files", ("a.jpg", _jpeg_bytes(), "image/jpeg"))],
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_upload_415_unsupported(self) -> None:
        org_id, user_id, manual_id, section_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_image_service(
                "upload_images",
                side_effect=welcome_manual_section_image_service.ImageRejected("unsupported file type"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/images",
                    files=[("files", ("a.pdf", b"%PDF-1.7", "application/pdf"))],
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 415

    @pytest.mark.asyncio
    async def test_upload_413_too_large(self) -> None:
        org_id, user_id, manual_id, section_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_image_service(
                "upload_images",
                side_effect=welcome_manual_section_image_service.ImageRejected("file exceeds 10MB limit"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/images",
                    files=[("files", ("big.jpg", _jpeg_bytes(), "image/jpeg"))],
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 413

    @pytest.mark.asyncio
    async def test_upload_503_storage(self) -> None:
        org_id, user_id, manual_id, section_id = (uuid.uuid4() for _ in range(4))
        _override_auth(org_id, user_id)
        try:
            with patch_image_service(
                "upload_images",
                side_effect=welcome_manual_section_image_service.StorageNotConfiguredError("down"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/images",
                    files=[("files", ("a.jpg", _jpeg_bytes(), "image/jpeg"))],
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 503


class TestUpdateDelete:
    @pytest.mark.asyncio
    async def test_update_200(self) -> None:
        org_id, user_id, manual_id, section_id, image_id = (uuid.uuid4() for _ in range(5))
        _override_auth(org_id, user_id)
        try:
            with patch_image_service(
                "update_image",
                return_value=_image_response(section_id, caption="renamed"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/images/{image_id}",
                    json={"caption": "renamed"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200
        assert response.json()["caption"] == "renamed"

    @pytest.mark.asyncio
    async def test_update_image_404(self) -> None:
        org_id, user_id, manual_id, section_id, image_id = (uuid.uuid4() for _ in range(5))
        _override_auth(org_id, user_id)
        try:
            with patch_image_service(
                "update_image",
                side_effect=welcome_manual_section_image_service.ImageNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.patch(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/images/{image_id}",
                    json={"caption": "x"},
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_204(self) -> None:
        org_id, user_id, manual_id, section_id, image_id = (uuid.uuid4() for _ in range(5))
        _override_auth(org_id, user_id)
        try:
            with patch_image_service("delete_image", return_value=None):
                client = TestClient(app)
                response = client.delete(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/images/{image_id}",
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_image_404(self) -> None:
        org_id, user_id, manual_id, section_id, image_id = (uuid.uuid4() for _ in range(5))
        _override_auth(org_id, user_id)
        try:
            with patch_image_service(
                "delete_image",
                side_effect=welcome_manual_section_image_service.ImageNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.delete(
                    f"/welcome-manuals/{manual_id}/sections/{section_id}/images/{image_id}",
                )
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 404
