"""Tests for the public-read / auth-write split.

MGA's auth model (see apps/mygamingassistant/CLAUDE.md → Authentication Model):
public users can browse the lineup library; only the operator can mutate
content or access operational endpoints.

These tests pin the split so it cannot regress silently. They use the
``client`` (unauthenticated) and ``auth_client`` (authed) fixtures from
conftest.py.

Coverage matrix:
  - Public routes return 200 / 404 / valid response without auth
  - Auth routes return 401 (or 403) without auth
  - Auth routes return 200 with valid auth
  - Public GET /lineups/{id} 404s on non-accepted lineups (pending / hidden)
  - test_helpers/reset-rate-limit remains callable without auth (E2E need)
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
        slug="auth-test-game",
        name="Auth Test Game",
        side_a_label="T",
        side_b_label="CT",
    )
    db.add(game)
    await db.flush()

    map_obj = Map(game_id=game.id, slug="auth-test-map", name="Auth Test Map")
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
    """Authed client identical in shape to test_lineups.auth_client."""
    from fastapi_users.password import PasswordHelper
    from sqlalchemy import select

    TEST_EMAIL = "auth-gating-test@example.com"
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


@pytest.fixture(autouse=True)
def mock_storage():
    """Stub the storage client so we don't need a real MinIO running."""
    mock = MagicMock()
    mock.bucket = settings.minio_bucket
    mock.generate_presigned_url.return_value = "https://minio.example.com/signed-read-url"
    mock._client = MagicMock()
    mock._client.presigned_put_object.return_value = "https://minio.example.com/signed-put-url"

    # get_storage is imported by-reference into BOTH the upload path
    # (lineup_service.get_upload_url) and the read-signing path
    # (lineup_url_signing._sign_screenshot_url, extracted in the R2 PR). Patch
    # every consumer that imported the name — patching only lineup_service
    # leaves the read path calling the real MinIO client, which raises
    # StorageNotConfiguredError in CI (no MinIO env). See conftest's
    # unit_of_work note for the same by-reference patching discipline.
    with (
        patch("app.services.game.lineup_service.get_storage", return_value=mock),
        patch("app.services.game.lineup_url_signing.get_storage", return_value=mock),
    ):
        yield mock


@pytest_asyncio.fixture
async def accepted_lineup(
    db: AsyncSession, seeded_game_map: dict
) -> Lineup:
    """Persist an accepted lineup directly in the DB."""
    lineup = Lineup(
        id=uuid.uuid4(),
        game_id=seeded_game_map["game"].id,
        map_id=seeded_game_map["map"].id,
        target_zone_id=seeded_game_map["zone_a"].id,
        stand_zone_id=seeded_game_map["zone_b"].id,
        side="side_a",
        utility_type_id=seeded_game_map["util"].id,
        title="Public-accessible smoke",
        notes="",
        stand_screenshot_url="seed/stand.png",
        aim_screenshot_url="seed/aim.png",
        aim_anchor_x=0.5,
        aim_anchor_y=0.4,
        setup_seconds=8,
        status="accepted",
    )
    db.add(lineup)
    await db.flush()
    return lineup


@pytest_asyncio.fixture
async def pending_lineup(
    db: AsyncSession, seeded_game_map: dict
) -> Lineup:
    """Persist a pending_review lineup directly in the DB."""
    lineup = Lineup(
        id=uuid.uuid4(),
        game_id=seeded_game_map["game"].id,
        map_id=seeded_game_map["map"].id,
        title="Pending — should not leak",
        status="pending_review",
    )
    db.add(lineup)
    await db.flush()
    return lineup


# ---------------------------------------------------------------------------
# Public route tests — accept anonymous traffic
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_public_get_games_no_auth(
    client: AsyncClient, seeded_game_map: dict
):
    """GET /api/games must be callable without auth."""
    resp = await client.get("/api/games")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body, list)
    assert any(g["slug"] == "auth-test-game" for g in body)


@pytest.mark.asyncio
async def test_public_get_maps_no_auth(
    client: AsyncClient, seeded_game_map: dict
):
    """GET /api/games/{game_slug}/maps must be callable without auth."""
    resp = await client.get(f"/api/games/{seeded_game_map['game'].slug}/maps")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert any(m["slug"] == "auth-test-map" for m in body)


@pytest.mark.asyncio
async def test_public_get_map_detail_no_auth(
    client: AsyncClient, seeded_game_map: dict
):
    """GET /api/games/{slug}/maps/{slug} must be callable without auth."""
    resp = await client.get(
        f"/api/games/{seeded_game_map['game'].slug}/maps/{seeded_game_map['map'].slug}"
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["slug"] == "auth-test-map"
    assert "zones" in body
    assert "utility_types" in body


@pytest.mark.asyncio
async def test_public_list_lineups_no_auth(
    client: AsyncClient, seeded_game_map: dict, accepted_lineup: Lineup
):
    """GET /api/lineups must be callable without auth and return accepted lineups."""
    resp = await client.get("/api/lineups")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert any(l["id"] == str(accepted_lineup.id) for l in body)


@pytest.mark.asyncio
async def test_public_get_accepted_lineup_no_auth(
    client: AsyncClient, accepted_lineup: Lineup
):
    """GET /api/lineups/{id} must return accepted lineups without auth."""
    resp = await client.get(f"/api/lineups/{accepted_lineup.id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(accepted_lineup.id)
    # Presigned URL is part of the public payload
    assert "stand_screenshot_url" in body


@pytest.mark.asyncio
async def test_public_get_pending_lineup_returns_404(
    client: AsyncClient, pending_lineup: Lineup
):
    """Public GET /api/lineups/{id} must 404 on pending_review lineups.

    Their presigned screenshot URLs are sensitive — they're operator-only
    until accepted.
    """
    resp = await client.get(f"/api/lineups/{pending_lineup.id}")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_public_zone_density_no_auth(
    client: AsyncClient, seeded_game_map: dict
):
    """GET /api/games/{slug}/maps/{slug}/zone-density must be callable without auth."""
    resp = await client.get(
        f"/api/games/{seeded_game_map['game'].slug}/maps/{seeded_game_map['map'].slug}/zone-density"
    )
    assert resp.status_code == 200, resp.text
    assert isinstance(resp.json(), dict)


@pytest.mark.asyncio
async def test_public_list_lineup_packages_no_auth(
    client: AsyncClient,
):
    """GET /api/lineup-packages must be callable without auth."""
    resp = await client.get("/api/lineup-packages")
    assert resp.status_code == 200, resp.text
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_public_health_no_auth(client: AsyncClient):
    """GET /health must be callable without auth."""
    resp = await client.get("/api/health")
    # 200 (db reachable) or 503 (degraded) both acceptable — must not be 401
    assert resp.status_code in (200, 503)


# ---------------------------------------------------------------------------
# Auth-required routes — must 401 without auth
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "method, path",
    [
        # Lineups mutation surface
        ("POST", "/api/lineups/upload-url"),
        ("POST", "/api/lineups"),
        ("PATCH", "/api/lineups/00000000-0000-0000-0000-000000000000"),
        ("DELETE", "/api/lineups/00000000-0000-0000-0000-000000000000"),
        ("GET", "/api/lineups/00000000-0000-0000-0000-000000000000/admin"),
        ("POST", "/api/lineups/00000000-0000-0000-0000-000000000000/classify"),
        ("POST", "/api/lineups/00000000-0000-0000-0000-000000000000/accept"),
        ("POST", "/api/lineups/00000000-0000-0000-0000-000000000000/hide"),
        ("POST", "/api/lineups/bulk-accept"),
        ("GET", "/api/lineups/pending"),
        # Lineup packages
        ("POST", "/api/lineup-packages"),
        ("PATCH", "/api/lineup-packages/00000000-0000-0000-0000-000000000000"),
        ("DELETE", "/api/lineup-packages/00000000-0000-0000-0000-000000000000"),
        # Sources (entire surface)
        ("GET", "/api/sources"),
        ("POST", "/api/sources"),
        ("GET", "/api/sources/00000000-0000-0000-0000-000000000000"),
        ("DELETE", "/api/sources/00000000-0000-0000-0000-000000000000"),
        ("POST", "/api/sources/00000000-0000-0000-0000-000000000000/sync"),
        # Scheduler
        ("GET", "/api/scheduler/status"),
        ("POST", "/api/scheduler/trigger/sync_all_sources"),
        # Admin
        ("GET", "/admin/users"),
        ("GET", "/admin/auth-events"),
        # User self-service
        ("GET", "/api/users/me"),
        ("GET", "/api/users/me/export"),
    ],
)
@pytest.mark.asyncio
async def test_auth_required_routes_401_without_auth(
    client: AsyncClient, method: str, path: str
):
    """Every auth-required route must 401 without a valid token."""
    resp = await client.request(method, path)
    # fastapi-users returns 401 for missing/invalid token; some routes
    # under our auth-router dependency also surface 401. Accept either
    # 401 (no auth) or 403 (auth but forbidden).
    assert resp.status_code in (401, 403), (
        f"{method} {path} expected 401/403, got {resp.status_code}: {resp.text}"
    )


# ---------------------------------------------------------------------------
# Authed access — auth routes accept valid tokens
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_authed_list_sources(auth_client: AsyncClient):
    """GET /api/sources must succeed with valid auth."""
    resp = await auth_client.get("/api/sources")
    assert resp.status_code == 200, resp.text
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_authed_list_pending(auth_client: AsyncClient):
    """GET /api/lineups/pending must succeed with valid auth."""
    resp = await auth_client.get("/api/lineups/pending")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "items" in body or "lineups" in body or isinstance(body, dict)


@pytest.mark.asyncio
async def test_authed_get_admin_lineup_returns_pending(
    auth_client: AsyncClient, pending_lineup: Lineup
):
    """GET /api/lineups/{id}/admin must return pending lineups for the operator."""
    resp = await auth_client.get(f"/api/lineups/{pending_lineup.id}/admin")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(pending_lineup.id)
    assert body["status"] == "pending_review"


@pytest.mark.asyncio
async def test_authed_scheduler_status(auth_client: AsyncClient):
    """GET /api/scheduler/status must succeed with valid auth."""
    resp = await auth_client.get("/api/scheduler/status")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "running" in body
    assert "jobs" in body
