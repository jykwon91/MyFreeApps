"""Tests for the minimap-upload endpoints in api/games.py.

Covers:
- POST /api/maps/{map_id}/minimap-upload-url returns a presigned PUT + key
- Endpoint rejects unauthenticated callers (router-level auth gate)
- POST /api/maps/{map_id}/minimap updates Map.minimap_url and signs response
- Confirm rejects mismatched object_key (cannot repoint to arbitrary keys)
- Confirm rejects oversize and disallowed content-type uploads
- sign_minimap_url passes through paths/URLs unchanged, signs object keys
"""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.game import Game
from app.models.game.map import Map
from app.models.user.user import User
from app.services.game import map_service


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    """Create a test user and log in; return an authed AsyncClient.

    Inlined from test_lineups.py so this test module is self-contained.
    """
    from fastapi_users.password import PasswordHelper
    from sqlalchemy import select

    TEST_EMAIL = "minimap-test@example.com"
    TEST_PASSWORD = "testpassword123!"

    result = await db.execute(select(User).where(User.email == TEST_EMAIL))
    user = result.scalar_one_or_none()
    if user is None:
        helper = PasswordHelper()
        user = User(
            email=TEST_EMAIL,
            hashed_password=helper.hash(TEST_PASSWORD),
            is_verified=True,
            is_active=True,
        )
        db.add(user)
        await db.flush()

    login = await client.post(
        "/auth/jwt/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest_asyncio.fixture
async def seeded_map(db: AsyncSession) -> Map:
    game = Game(slug="cs2-test", name="CS2 Test", side_a_label="T", side_b_label="CT")
    db.add(game)
    await db.flush()
    map_obj = Map(game_id=game.id, slug="mirage-test", name="Mirage Test")
    db.add(map_obj)
    await db.flush()
    return map_obj


@pytest.fixture
def mock_storage_for_minimap():
    """Mock the storage client used by map_service helpers."""
    mock = MagicMock()
    mock.bucket = "mygamingassistant-test"
    mock._client.presigned_put_object.return_value = (
        "https://minio.example.com/signed-put-url"
    )
    # stat_object default: PNG, 100KB
    stat_mock = MagicMock(size=100 * 1024, content_type="image/png")
    mock._client.stat_object.return_value = stat_mock
    mock.generate_presigned_url.return_value = "https://minio.example.com/signed-get-url"
    with patch("app.services.game.map_service.get_storage", return_value=mock):
        yield mock


# ---------------------------------------------------------------------------
# Upload-url endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upload_url_requires_auth(
    client: AsyncClient, seeded_map: Map
):
    """Unauthenticated callers must get 401."""
    resp = await client.post(f"/api/maps/{seeded_map.id}/minimap-upload-url")
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_upload_url_returns_put_url_and_canonical_key(
    auth_client: AsyncClient, seeded_map: Map, mock_storage_for_minimap
):
    """Authed POST returns a presigned PUT URL + canonical object key."""
    resp = await auth_client.post(f"/api/maps/{seeded_map.id}/minimap-upload-url")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["put_url"] == "https://minio.example.com/signed-put-url"
    assert body["object_key"] == f"maps/{seeded_map.id}/minimap.png"


@pytest.mark.asyncio
async def test_upload_url_unknown_map_404(
    auth_client: AsyncClient, mock_storage_for_minimap
):
    bogus_id = uuid.uuid4()
    resp = await auth_client.post(f"/api/maps/{bogus_id}/minimap-upload-url")
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Confirm endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_confirm_updates_minimap_url_and_returns_signed(
    auth_client: AsyncClient, seeded_map: Map, mock_storage_for_minimap
):
    """Confirm endpoint persists object_key in DB and returns presigned GET URL."""
    object_key = f"maps/{seeded_map.id}/minimap.png"
    resp = await auth_client.post(
        f"/api/maps/{seeded_map.id}/minimap",
        json={"object_key": object_key},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["map_id"] == str(seeded_map.id)
    # The signed URL came from the mock's generate_presigned_url.
    assert body["minimap_url"] == "https://minio.example.com/signed-get-url"


@pytest.mark.asyncio
async def test_confirm_rejects_wrong_object_key(
    auth_client: AsyncClient, seeded_map: Map, mock_storage_for_minimap
):
    """Cannot repoint Map.minimap_url at an arbitrary object key — 422."""
    resp = await auth_client.post(
        f"/api/maps/{seeded_map.id}/minimap",
        json={"object_key": "some/other/object.png"},
    )
    assert resp.status_code == 422, resp.text
    assert "expected" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_confirm_rejects_oversize(
    auth_client: AsyncClient, seeded_map: Map, mock_storage_for_minimap
):
    """6 MB upload exceeds the 5 MB ceiling → 422."""
    mock_storage_for_minimap._client.stat_object.return_value = MagicMock(
        size=6 * 1024 * 1024, content_type="image/png"
    )
    resp = await auth_client.post(
        f"/api/maps/{seeded_map.id}/minimap",
        json={"object_key": f"maps/{seeded_map.id}/minimap.png"},
    )
    assert resp.status_code == 422, resp.text
    assert "limit" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_confirm_rejects_non_image_content_type(
    auth_client: AsyncClient, seeded_map: Map, mock_storage_for_minimap
):
    """text/html upload (e.g. SVG-as-text) is rejected → 422."""
    mock_storage_for_minimap._client.stat_object.return_value = MagicMock(
        size=1024, content_type="text/html"
    )
    resp = await auth_client.post(
        f"/api/maps/{seeded_map.id}/minimap",
        json={"object_key": f"maps/{seeded_map.id}/minimap.png"},
    )
    assert resp.status_code == 422, resp.text
    assert "content-type" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# sign_minimap_url helper
# ---------------------------------------------------------------------------

def test_sign_minimap_url_passes_through_path():
    """Relative paths (bundled assets) pass through unchanged."""
    assert map_service.sign_minimap_url("/minimaps/cs2/mirage.png") == "/minimaps/cs2/mirage.png"


def test_sign_minimap_url_passes_through_absolute():
    """Absolute http(s) URLs pass through unchanged."""
    assert (
        map_service.sign_minimap_url("https://cdn.example.com/x.png")
        == "https://cdn.example.com/x.png"
    )


def test_sign_minimap_url_none_stays_none():
    assert map_service.sign_minimap_url(None) is None
    assert map_service.sign_minimap_url("") is None


def test_sign_minimap_url_signs_object_key(mock_storage_for_minimap):
    """Object keys (no /, no protocol) get signed as presigned GET URLs."""
    result = map_service.sign_minimap_url("maps/some-uuid/minimap.png")
    assert result == "https://minio.example.com/signed-get-url"
    mock_storage_for_minimap.generate_presigned_url.assert_called_once_with(
        "maps/some-uuid/minimap.png", expires_in_seconds=24 * 3600
    )
