"""Route tests for the atomic reorder endpoints of a welcome manual's rooms,
section fields and section images. A stale list is a 409, never a 400, so a
client can tell "reload and try again" from "that request was malformed".
Mocks the service layer."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.core.welcome_manual_constants import (
    TOO_MANY_IMAGES_MESSAGE,
    WELCOME_MANUAL_MAX_FIELDS,
    WELCOME_MANUAL_MAX_SECTION_IMAGES,
    WELCOME_MANUAL_MAX_SECTIONS,
)
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.welcome_manuals.welcome_manual_room_response import WelcomeManualRoomResponse
from app.schemas.welcome_manuals.welcome_manual_section_field_response import (
    WelcomeManualSectionFieldResponse,
)
from app.schemas.welcome_manuals.welcome_manual_section_image_response import (
    WelcomeManualSectionImageResponse,
)
from app.services.welcome_manuals import (
    welcome_manual_room_service,
    welcome_manual_section_field_service,
    welcome_manual_section_image_service,
)


def _override_auth(role: OrgRole = OrgRole.OWNER) -> None:
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=role)
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[require_write_access] = lambda: ctx


def _put(url: str, body: dict[str, object]):
    try:
        return TestClient(app).put(url, json=body)
    finally:
        app.dependency_overrides.clear()


def _field(section_id: uuid.UUID, order: int) -> WelcomeManualSectionFieldResponse:
    return WelcomeManualSectionFieldResponse(
        id=uuid.uuid4(), section_id=section_id, label="L", value=None,
        display_order=order, created_at=datetime.now(timezone.utc),
    )


def _image(section_id: uuid.UUID, order: int) -> WelcomeManualSectionImageResponse:
    return WelcomeManualSectionImageResponse(
        id=uuid.uuid4(), section_id=section_id, storage_key="k/a.jpg", caption=None,
        display_order=order, created_at=datetime.now(timezone.utc),
        presigned_url="https://signed/a.jpg", is_available=True,
    )


def _room(manual_id: uuid.UUID, order: int) -> WelcomeManualRoomResponse:
    now = datetime.now(timezone.utc)
    return WelcomeManualRoomResponse(
        id=uuid.uuid4(), manual_id=manual_id, name="R", display_order=order,
        created_at=now, updated_at=now,
    )


class TestFieldReorder:
    @pytest.mark.asyncio
    async def test_ok(self) -> None:
        manual_id, section_id = uuid.uuid4(), uuid.uuid4()
        _override_auth()
        with patch.object(
            welcome_manual_section_field_service, "reorder_fields",
            return_value=[_field(section_id, 0), _field(section_id, 1)],
        ) as service:
            response = _put(
                f"/welcome-manuals/{manual_id}/sections/{section_id}/fields/order",
                {"field_ids": [str(uuid.uuid4()), str(uuid.uuid4())]},
            )
        assert response.status_code == 200
        assert [f["display_order"] for f in response.json()] == [0, 1]
        service.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_stale_list_is_409(self) -> None:
        _override_auth()
        with patch.object(
            welcome_manual_section_field_service, "reorder_fields",
            side_effect=welcome_manual_section_field_service.InvalidFieldReorderError("stale"),
        ):
            response = _put(
                f"/welcome-manuals/{uuid.uuid4()}/sections/{uuid.uuid4()}/fields/order",
                {"field_ids": [str(uuid.uuid4())]},
            )
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_missing_section_is_404(self) -> None:
        _override_auth()
        with patch.object(
            welcome_manual_section_field_service, "reorder_fields",
            side_effect=welcome_manual_section_field_service.SectionNotFoundError("gone"),
        ):
            response = _put(
                f"/welcome-manuals/{uuid.uuid4()}/sections/{uuid.uuid4()}/fields/order",
                {"field_ids": [str(uuid.uuid4())]},
            )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_empty_list_is_422(self) -> None:
        _override_auth()
        response = _put(
            f"/welcome-manuals/{uuid.uuid4()}/sections/{uuid.uuid4()}/fields/order",
            {"field_ids": []},
        )
        assert response.status_code == 422


class TestImageReorder:
    @pytest.mark.asyncio
    async def test_ok(self) -> None:
        section_id = uuid.uuid4()
        _override_auth()
        with patch.object(
            welcome_manual_section_image_service, "reorder_images",
            return_value=[_image(section_id, 0), _image(section_id, 1)],
        ):
            response = _put(
                f"/welcome-manuals/{uuid.uuid4()}/sections/{section_id}/images/order",
                {"image_ids": [str(uuid.uuid4()), str(uuid.uuid4())]},
            )
        assert response.status_code == 200
        assert len(response.json()) == 2

    @pytest.mark.asyncio
    async def test_stale_list_is_409(self) -> None:
        _override_auth()
        with patch.object(
            welcome_manual_section_image_service, "reorder_images",
            side_effect=welcome_manual_section_image_service.InvalidImageReorderError("stale"),
        ):
            response = _put(
                f"/welcome-manuals/{uuid.uuid4()}/sections/{uuid.uuid4()}/images/order",
                {"image_ids": [str(uuid.uuid4())]},
            )
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_missing_manual_is_404(self) -> None:
        _override_auth()
        with patch.object(
            welcome_manual_section_image_service, "reorder_images",
            side_effect=welcome_manual_section_image_service.ManualNotFoundError("gone"),
        ):
            response = _put(
                f"/welcome-manuals/{uuid.uuid4()}/sections/{uuid.uuid4()}/images/order",
                {"image_ids": [str(uuid.uuid4())]},
            )
        assert response.status_code == 404


class TestRoomReorder:
    @pytest.mark.asyncio
    async def test_ok(self) -> None:
        manual_id = uuid.uuid4()
        _override_auth()
        with patch.object(
            welcome_manual_room_service, "reorder_rooms",
            return_value=[_room(manual_id, 0), _room(manual_id, 1)],
        ):
            response = _put(
                f"/welcome-manuals/{manual_id}/rooms/order",
                {"room_ids": [str(uuid.uuid4()), str(uuid.uuid4())]},
            )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_stale_list_is_409(self) -> None:
        _override_auth()
        with patch.object(
            welcome_manual_room_service, "reorder_rooms",
            side_effect=welcome_manual_room_service.InvalidRoomReorderError("stale"),
        ):
            response = _put(
                f"/welcome-manuals/{uuid.uuid4()}/rooms/order",
                {"room_ids": [str(uuid.uuid4())]},
            )
        assert response.status_code == 409


def _patch(url: str, body: dict[str, object]):
    try:
        return TestClient(app).patch(url, json=body)
    finally:
        app.dependency_overrides.clear()


class TestPositionOnlyMovesThroughReorder:
    """A PATCH can't set display_order, so it can't create two rows at one position."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("kind", ["fields", "images"])
    async def test_patch_with_display_order_is_422(self, kind: str) -> None:
        _override_auth()
        response = _patch(
            f"/welcome-manuals/{uuid.uuid4()}/sections/{uuid.uuid4()}/{kind}/{uuid.uuid4()}",
            {"display_order": 0},
        )
        assert response.status_code == 422


class TestReorderListCaps:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("path", "key", "limit"),
        [
            ("sections/order", "section_ids", WELCOME_MANUAL_MAX_SECTIONS),
            ("sections/{section}/fields/order", "field_ids", WELCOME_MANUAL_MAX_FIELDS),
            ("sections/{section}/images/order", "image_ids", WELCOME_MANUAL_MAX_SECTION_IMAGES),
        ],
    )
    async def test_a_list_longer_than_the_cap_is_422(self, path: str, key: str, limit: int) -> None:
        _override_auth()
        url = f"/welcome-manuals/{uuid.uuid4()}/" + path.format(section=uuid.uuid4())
        response = _put(url, {key: [str(uuid.uuid4()) for _ in range(limit + 1)]})
        assert response.status_code == 422


class TestUploadCap:
    @pytest.mark.asyncio
    async def test_a_batch_past_the_photo_cap_is_409_with_the_cap_in_the_message(self) -> None:
        _override_auth()
        message = TOO_MANY_IMAGES_MESSAGE.format(max=WELCOME_MANUAL_MAX_SECTION_IMAGES)
        with patch.object(
            welcome_manual_section_image_service, "upload_images",
            new=AsyncMock(side_effect=welcome_manual_section_image_service.TooManyImagesError(message)),
        ):
            try:
                response = TestClient(app).post(
                    f"/welcome-manuals/{uuid.uuid4()}/sections/{uuid.uuid4()}/images",
                    files=[("files", ("a.jpg", b"x", "image/jpeg"))],
                )
            finally:
                app.dependency_overrides.clear()
        assert response.status_code == 409
        assert response.json()["detail"] == message
