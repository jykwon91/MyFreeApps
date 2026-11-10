"""A HEIC upload through the real route and service is stored as image/jpeg.

Listing photos and welcome-manual section images share ``process_image``. The
storage client and repositories are faked; the route, service and image
processor are real.
"""
from __future__ import annotations

import io
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole


_LISTING_SERVICE = "app.services.listings.listing_photo_service"
_MANUAL_SERVICE = "app.services.welcome_manuals.welcome_manual_section_image_service"


def _heic_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 24), (10, 120, 200)).save(buf, format="HEIF")
    return buf.getvalue()


@asynccontextmanager
async def _fake_uow():
    yield MagicMock()


def _fake_storage() -> MagicMock:
    storage = MagicMock()
    storage.generate_key.side_effect = lambda prefix, name: f"{prefix}/abc/{name}"
    return storage


def _row(**fields: object) -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), caption=None, created_at=datetime.now(timezone.utc), **fields)


@pytest.fixture
def auth():
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    ctx = RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[require_write_access] = lambda: ctx
    yield
    app.dependency_overrides.clear()


def test_listing_photo_heic_upload_is_stored_as_jpeg(auth: None) -> None:
    listing_id = uuid.uuid4()
    storage = _fake_storage()

    async def create(_db, *, listing_id, storage_key, caption, display_order):
        return _row(listing_id=listing_id, storage_key=storage_key, display_order=display_order)

    with patch(f"{_LISTING_SERVICE}.get_storage", return_value=storage), \
            patch(f"{_LISTING_SERVICE}.unit_of_work", _fake_uow), \
            patch(f"{_LISTING_SERVICE}.listing_repo.get_by_id", AsyncMock(return_value=SimpleNamespace(id=listing_id))), \
            patch(f"{_LISTING_SERVICE}.listing_photo_repo.next_display_order", AsyncMock(return_value=0)), \
            patch(f"{_LISTING_SERVICE}.listing_photo_repo.create", create), \
            patch(f"{_LISTING_SERVICE}.attach_presigned_urls", lambda rows: rows):
        response = TestClient(app).post(
            f"/listings/{listing_id}/photos",
            files=[("files", ("IMG_0001.HEIC", _heic_bytes(), "image/heic"))],
        )

    assert response.status_code == 201, response.text
    key, content, content_type = storage.upload_file.call_args.args
    assert content_type == "image/jpeg"
    assert key.endswith("/IMG_0001.jpg")
    assert response.json()[0]["storage_key"] == key
    with Image.open(io.BytesIO(content)) as stored:
        assert stored.format == "JPEG"


def test_listing_photo_corrupt_heic_is_rejected_with_415(auth: None) -> None:
    corrupt = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 200
    with patch(f"{_LISTING_SERVICE}.get_storage", return_value=_fake_storage()):
        response = TestClient(app).post(
            f"/listings/{uuid.uuid4()}/photos",
            files=[("files", ("bad.heic", corrupt, "image/heic"))],
        )

    assert response.status_code == 415


def test_welcome_manual_section_heic_upload_is_stored_as_jpeg(auth: None) -> None:
    manual_id, section_id = uuid.uuid4(), uuid.uuid4()
    storage = _fake_storage()

    async def create(_db, *, section_id, storage_key, caption, display_order):
        return _row(
            section_id=section_id, storage_key=storage_key, display_order=display_order,
            presigned_url=None, is_available=True,
        )

    with patch(f"{_MANUAL_SERVICE}.get_storage", return_value=storage), \
            patch(f"{_MANUAL_SERVICE}.unit_of_work", _fake_uow), \
            patch(f"{_MANUAL_SERVICE}.load_section_for_update", AsyncMock(return_value=SimpleNamespace(id=section_id))), \
            patch(f"{_MANUAL_SERVICE}.welcome_manual_section_image_repo.list_by_section", AsyncMock(return_value=[])), \
            patch(f"{_MANUAL_SERVICE}.welcome_manual_section_image_repo.next_display_order", AsyncMock(return_value=0)), \
            patch(f"{_MANUAL_SERVICE}.welcome_manual_section_image_repo.create", create), \
            patch(f"{_MANUAL_SERVICE}.attach_presigned_urls", lambda rows: rows):
        response = TestClient(app).post(
            f"/welcome-manuals/{manual_id}/sections/{section_id}/images",
            files=[("files", ("router.heif", _heic_bytes(), "image/heic"))],
        )

    assert response.status_code == 201, response.text
    key, content, content_type = storage.upload_file.call_args.args
    assert content_type == "image/jpeg"
    assert key.endswith("/router.jpg")
    with Image.open(io.BytesIO(content)) as stored:
        assert stored.format == "JPEG"
