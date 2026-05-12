"""Unit + integration tests for the lineup API (PR 2).

Tests verify:
- POST /api/lineups/upload-url returns two URLs + lineup_id
- POST /api/lineups creates a lineup (status=accepted by default)
- GET /api/lineups lists with filters
- GET /api/lineups/{id} returns detail
- PATCH /api/lineups/{id} updates fields
- DELETE /api/lineups/{id} soft-deletes (status=hidden)
- GET /api/games/{game_slug}/maps/{map_slug}/zone-density returns correct counts
- Side 'any' semantics: lineup.side='any' appears in side_a and side_b queries
"""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.game.game import Game
from app.models.game.lineup import Lineup
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.utility_type import UtilityType
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def seeded_game_map(db: AsyncSession) -> dict:
    """Create a minimal Game + Map + 2 MapZones + UtilityType in the test DB."""
    game = Game(
        slug="test-game",
        name="Test Game",
        side_a_label="T",
        side_b_label="CT",
    )
    db.add(game)
    await db.flush()

    map_obj = Map(game_id=game.id, slug="test-map", name="Test Map")
    db.add(map_obj)
    await db.flush()

    zone_a = MapZone(map_id=map_obj.id, slug="a-site", name="A Site", polygon_points=[])
    zone_b = MapZone(map_id=map_obj.id, slug="b-site", name="B Site", polygon_points=[])
    db.add(zone_a)
    db.add(zone_b)
    await db.flush()

    util = UtilityType(game_id=game.id, slug="smoke", name="Smoke")
    db.add(util)
    await db.flush()

    return {
        "game": game,
        "map": map_obj,
        "zone_a": zone_a,
        "zone_b": zone_b,
        "util": util,
    }


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    """Create a test user directly in the DB, log in, return authed client."""
    from fastapi_users.password import PasswordHelper
    from sqlalchemy import select

    TEST_EMAIL = "lineup-test@example.com"
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

    resp = await client.post(
        "/api/auth/jwt/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if resp.status_code != 200:
        pytest.skip(f"Could not authenticate test user: {resp.status_code} {resp.text}")

    token = resp.json().get("access_token", "")
    client.headers["Authorization"] = f"Bearer {token}"
    return client


# ---------------------------------------------------------------------------
# Mock storage so tests don't need a real MinIO
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def mock_storage():
    """Stub out the storage client for all lineup tests."""
    mock = MagicMock()
    mock.bucket = settings.minio_bucket
    mock.generate_presigned_url.return_value = "https://minio.example.com/signed-read-url"
    mock._client = MagicMock()
    mock._client.presigned_put_object.return_value = "https://minio.example.com/signed-put-url"

    with patch("app.services.game.lineup_service.get_storage", return_value=mock):
        yield mock


# ---------------------------------------------------------------------------
# Helper: create a lineup via the API
# ---------------------------------------------------------------------------

async def _create_lineup(
    client: AsyncClient,
    seeded: dict,
    *,
    side: str = "side_a",
    status_override: str | None = None,
) -> dict:
    payload = {
        "game_id": str(seeded["game"].id),
        "map_id": str(seeded["map"].id),
        "target_zone_id": str(seeded["zone_a"].id),
        "stand_zone_id": str(seeded["zone_b"].id),
        "side": side,
        "utility_type_id": str(seeded["util"].id),
        "title": "A-site smoke from CT spawn",
        "notes": "Stand on the box",
        "stand_screenshot_key": "user1/lineup1/stand.png",
        "aim_screenshot_key": "user1/lineup1/aim.png",
        "aim_anchor_x": 0.5,
        "aim_anchor_y": 0.4,
        "setup_seconds": 8,
    }
    resp = await client.post("/api/lineups", json=payload)
    return resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upload_url_returns_two_urls(auth_client: AsyncClient):
    """POST /api/lineups/upload-url should return two presigned PUT URLs."""
    resp = await auth_client.post("/api/lineups/upload-url")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "lineup_id" in body
    assert "stand_upload_url" in body
    assert "aim_upload_url" in body
    assert "stand_object_key" in body
    assert "aim_object_key" in body
    # Object keys should include the lineup_id UUID
    assert body["lineup_id"] in body["stand_object_key"]


@pytest.mark.asyncio
async def test_create_lineup_status_accepted(
    auth_client: AsyncClient, seeded_game_map: dict
):
    """POST /api/lineups should create a lineup with status=accepted."""
    resp = await _create_lineup(auth_client, seeded_game_map)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "accepted"
    assert body["title"] == "A-site smoke from CT spawn"
    assert body["side"] == "side_a"
    assert "target_zone" in body
    assert "utility_type" in body


@pytest.mark.asyncio
async def test_list_lineups_default_accepted_only(
    auth_client: AsyncClient, seeded_game_map: dict
):
    """GET /api/lineups should return only accepted lineups by default."""
    # Create a lineup
    create_resp = await _create_lineup(auth_client, seeded_game_map)
    assert create_resp.status_code == 201

    lineup_id = create_resp.json()["id"]

    # Delete it (soft delete → hidden)
    del_resp = await auth_client.delete(f"/api/lineups/{lineup_id}")
    assert del_resp.status_code == 204

    # Default list should not include hidden lineup
    list_resp = await auth_client.get("/api/lineups")
    assert list_resp.status_code == 200
    ids = [l["id"] for l in list_resp.json()]
    assert lineup_id not in ids


@pytest.mark.asyncio
async def test_list_lineups_filter_by_map(
    auth_client: AsyncClient, seeded_game_map: dict
):
    """GET /api/lineups?game_slug=&map_slug= should filter correctly."""
    create_resp = await _create_lineup(auth_client, seeded_game_map)
    assert create_resp.status_code == 201

    game_slug = seeded_game_map["game"].slug
    map_slug = seeded_game_map["map"].slug

    resp = await auth_client.get(f"/api/lineups?game_slug={game_slug}&map_slug={map_slug}")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    assert all(i["map_id"] == str(seeded_game_map["map"].id) for i in items)


@pytest.mark.asyncio
async def test_side_any_semantics(
    auth_client: AsyncClient, seeded_game_map: dict, db: AsyncSession
):
    """Lineup with side='any' must appear in both side_a and side_b filter queries."""
    # Create an "any" lineup
    payload = {
        "game_id": str(seeded_game_map["game"].id),
        "map_id": str(seeded_game_map["map"].id),
        "target_zone_id": str(seeded_game_map["zone_a"].id),
        "stand_zone_id": str(seeded_game_map["zone_b"].id),
        "side": "any",
        "utility_type_id": str(seeded_game_map["util"].id),
        "title": "Works both sides",
    }
    resp = await auth_client.post("/api/lineups", json=payload)
    assert resp.status_code == 201
    lineup_id = resp.json()["id"]

    game_slug = seeded_game_map["game"].slug
    map_slug = seeded_game_map["map"].slug
    base = f"/api/lineups?game_slug={game_slug}&map_slug={map_slug}"

    # Must appear in side_a query
    r_a = await auth_client.get(f"{base}&side=side_a")
    assert r_a.status_code == 200
    assert any(l["id"] == lineup_id for l in r_a.json()), "side='any' lineup missing from side_a query"

    # Must appear in side_b query
    r_b = await auth_client.get(f"{base}&side=side_b")
    assert r_b.status_code == 200
    assert any(l["id"] == lineup_id for l in r_b.json()), "side='any' lineup missing from side_b query"


@pytest.mark.asyncio
async def test_get_lineup_detail(
    auth_client: AsyncClient, seeded_game_map: dict
):
    """GET /api/lineups/{id} should return full detail."""
    create_resp = await _create_lineup(auth_client, seeded_game_map)
    lineup_id = create_resp.json()["id"]

    resp = await auth_client.get(f"/api/lineups/{lineup_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == lineup_id
    assert body["aim_anchor_x"] == 0.5


@pytest.mark.asyncio
async def test_patch_lineup(
    auth_client: AsyncClient, seeded_game_map: dict
):
    """PATCH /api/lineups/{id} should update specified fields only."""
    create_resp = await _create_lineup(auth_client, seeded_game_map)
    lineup_id = create_resp.json()["id"]

    resp = await auth_client.patch(
        f"/api/lineups/{lineup_id}",
        json={"title": "Updated title", "notes": "Updated notes"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Updated title"
    assert body["notes"] == "Updated notes"
    # Unchanged fields preserved
    assert body["side"] == "side_a"


@pytest.mark.asyncio
async def test_delete_lineup_soft(
    auth_client: AsyncClient, seeded_game_map: dict
):
    """DELETE /api/lineups/{id} should set status=hidden, not remove the row."""
    create_resp = await _create_lineup(auth_client, seeded_game_map)
    lineup_id = create_resp.json()["id"]

    del_resp = await auth_client.delete(f"/api/lineups/{lineup_id}")
    assert del_resp.status_code == 204

    # Should still be fetchable (not hard-deleted)
    detail_resp = await auth_client.get(f"/api/lineups/{lineup_id}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["status"] == "hidden"


@pytest.mark.asyncio
async def test_zone_density_endpoint(
    auth_client: AsyncClient, seeded_game_map: dict
):
    """GET .../zone-density should count accepted lineups per zone."""
    # Create two lineups targeting zone_a
    for _ in range(2):
        await _create_lineup(auth_client, seeded_game_map, side="side_a")

    game_slug = seeded_game_map["game"].slug
    map_slug = seeded_game_map["map"].slug
    zone_a_id = str(seeded_game_map["zone_a"].id)

    resp = await auth_client.get(
        f"/api/games/{game_slug}/maps/{map_slug}/zone-density?side=side_a"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert zone_a_id in body
    assert body[zone_a_id]["count"] >= 2
    assert "by_utility" in body[zone_a_id]
    assert "smoke" in body[zone_a_id]["by_utility"]


@pytest.mark.asyncio
async def test_404_on_unknown_lineup(auth_client: AsyncClient):
    """GET /api/lineups/{unknown_id} should return 404."""
    resp = await auth_client.get(f"/api/lineups/{uuid.uuid4()}")
    assert resp.status_code == 404
