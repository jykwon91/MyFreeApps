"""Tests for PATCH /api/maps/{map_id}/zones — bulk zone polygon update.

Covers:
- Endpoint requires auth (401 unauth)
- Successful bulk update sets polygon_points and is persisted
- Partial failure: missing slug, 1-2 point polygon → reported in `failed`
  while valid zones in the same request are still applied
- Cross-map slug rejected (slug exists in OTHER map, not this one)
- Empty polygon (clears) accepted
- Coords out of [0,1] range rejected at Pydantic boundary (422)
- Unknown map returns 404
- Empty zones list rejected at Pydantic boundary (422)
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.game import Game
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.user.user import User


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    """Create a test user and log in; return an authed AsyncClient.

    Inlined per the test_minimap_upload.py pattern so this module is
    self-contained.
    """
    from fastapi_users.password import PasswordHelper

    TEST_EMAIL = "zone-polygon-test@example.com"
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
async def seeded_map_with_zones(db: AsyncSession) -> Map:
    """Seed a CS2-test game + Mirage-test map + 3 zones with empty polygons."""
    game = Game(slug="cs2-zonetest", name="CS2 ZoneTest", side_a_label="T", side_b_label="CT")
    db.add(game)
    await db.flush()
    map_obj = Map(game_id=game.id, slug="mirage-zonetest", name="Mirage ZoneTest")
    db.add(map_obj)
    await db.flush()
    for slug, name in [("a-site", "A Site"), ("b-site", "B Site"), ("mid", "Mid")]:
        zone = MapZone(map_id=map_obj.id, slug=slug, name=name, polygon_points=[])
        db.add(zone)
    await db.flush()
    return map_obj


@pytest_asyncio.fixture
async def second_map_with_zone(db: AsyncSession) -> Map:
    """Seed a second map with its own zone slug to test cross-map isolation."""
    game = Game(slug="cs2-zonetest-2", name="CS2 ZoneTest 2", side_a_label="T", side_b_label="CT")
    db.add(game)
    await db.flush()
    map_obj = Map(game_id=game.id, slug="inferno-zonetest", name="Inferno ZoneTest")
    db.add(map_obj)
    await db.flush()
    # Same slug "a-site" lives in this map too — should NOT collide with
    # the first map's "a-site" when patching.
    db.add(MapZone(map_id=map_obj.id, slug="a-site", name="A Site", polygon_points=[]))
    await db.flush()
    return map_obj


# ---------------------------------------------------------------------------
# Auth gate
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_patch_zones_requires_auth(client: AsyncClient, seeded_map_with_zones: Map):
    """Unauthenticated callers must get 401."""
    resp = await client.patch(
        f"/api/maps/{seeded_map_with_zones.id}/zones",
        json={"zones": [{"slug": "a-site", "polygon_points": []}]},
    )
    assert resp.status_code == 401, resp.text


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_patch_zones_updates_polygons(
    auth_client: AsyncClient, db: AsyncSession, seeded_map_with_zones: Map
):
    """Valid bulk update: all zones land in `updated`, polygon_points
    persisted in the object-shape the frontend reads."""
    body = {
        "zones": [
            {
                "slug": "a-site",
                "polygon_points": [
                    {"x": 0.7, "y": 0.3},
                    {"x": 0.9, "y": 0.3},
                    {"x": 0.9, "y": 0.5},
                    {"x": 0.7, "y": 0.5},
                ],
            },
            {
                "slug": "mid",
                "polygon_points": [
                    {"x": 0.4, "y": 0.4},
                    {"x": 0.6, "y": 0.4},
                    {"x": 0.5, "y": 0.6},
                ],
            },
        ]
    }
    resp = await auth_client.patch(
        f"/api/maps/{seeded_map_with_zones.id}/zones", json=body
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert sorted(payload["updated"]) == ["a-site", "mid"]
    assert payload["failed"] == []

    # Read back from DB and confirm shape.
    await db.expire_all()
    result = await db.execute(
        select(MapZone).where(MapZone.map_id == seeded_map_with_zones.id)
    )
    zones = {z.slug: z for z in result.scalars().all()}
    assert zones["a-site"].polygon_points == [
        {"x": 0.7, "y": 0.3},
        {"x": 0.9, "y": 0.3},
        {"x": 0.9, "y": 0.5},
        {"x": 0.7, "y": 0.5},
    ]
    assert len(zones["mid"].polygon_points) == 3
    # Untouched zone stays empty.
    assert zones["b-site"].polygon_points == []


@pytest.mark.asyncio
async def test_patch_zones_empty_polygon_clears(
    auth_client: AsyncClient, db: AsyncSession, seeded_map_with_zones: Map
):
    """`polygon_points: []` clears any previous polygon — used by the
    editor's `Clear polygon` action."""
    # First, seed a polygon directly.
    result = await db.execute(
        select(MapZone).where(
            MapZone.map_id == seeded_map_with_zones.id, MapZone.slug == "a-site"
        )
    )
    zone = result.scalar_one()
    zone.polygon_points = [{"x": 0.1, "y": 0.1}, {"x": 0.2, "y": 0.1}, {"x": 0.2, "y": 0.2}]
    await db.flush()

    resp = await auth_client.patch(
        f"/api/maps/{seeded_map_with_zones.id}/zones",
        json={"zones": [{"slug": "a-site", "polygon_points": []}]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["updated"] == ["a-site"]

    await db.expire_all()
    result = await db.execute(
        select(MapZone).where(
            MapZone.map_id == seeded_map_with_zones.id, MapZone.slug == "a-site"
        )
    )
    assert result.scalar_one().polygon_points == []


# ---------------------------------------------------------------------------
# Partial failure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_patch_zones_partial_failure(
    auth_client: AsyncClient, db: AsyncSession, seeded_map_with_zones: Map
):
    """A 2-point polygon AND an unknown slug both land in `failed`, but
    the valid zone in the same request still saves."""
    body = {
        "zones": [
            {
                "slug": "a-site",
                "polygon_points": [
                    {"x": 0.1, "y": 0.1},
                    {"x": 0.2, "y": 0.1},
                    {"x": 0.2, "y": 0.2},
                ],
            },
            {
                "slug": "b-site",
                "polygon_points": [
                    {"x": 0.5, "y": 0.5},
                    {"x": 0.6, "y": 0.5},
                ],
            },
            {
                "slug": "ghost-zone",
                "polygon_points": [
                    {"x": 0.1, "y": 0.1},
                    {"x": 0.2, "y": 0.1},
                    {"x": 0.2, "y": 0.2},
                ],
            },
        ]
    }
    resp = await auth_client.patch(
        f"/api/maps/{seeded_map_with_zones.id}/zones", json=body
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["updated"] == ["a-site"]
    by_slug = {f["slug"]: f["reason"] for f in payload["failed"]}
    assert "b-site" in by_slug
    assert "3+" in by_slug["b-site"]
    assert "ghost-zone" in by_slug
    assert "not found" in by_slug["ghost-zone"]

    # B-site should still be empty in DB — the failure rolled the per-zone
    # change but committed the successful one.
    await db.expire_all()
    result = await db.execute(
        select(MapZone).where(
            MapZone.map_id == seeded_map_with_zones.id, MapZone.slug == "b-site"
        )
    )
    assert result.scalar_one().polygon_points == []


# ---------------------------------------------------------------------------
# Cross-map isolation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_patch_zones_cannot_cross_map_boundary(
    auth_client: AsyncClient,
    db: AsyncSession,
    seeded_map_with_zones: Map,
    second_map_with_zone: Map,
):
    """Map B has its own `a-site` zone. Patching map A's `/zones` with
    slug `a-site` must touch map A's zone only — map B's stays empty."""
    body = {
        "zones": [
            {
                "slug": "a-site",
                "polygon_points": [
                    {"x": 0.1, "y": 0.1},
                    {"x": 0.2, "y": 0.1},
                    {"x": 0.2, "y": 0.2},
                ],
            }
        ]
    }
    resp = await auth_client.patch(
        f"/api/maps/{seeded_map_with_zones.id}/zones", json=body
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["updated"] == ["a-site"]

    await db.expire_all()
    result = await db.execute(
        select(MapZone).where(
            MapZone.map_id == second_map_with_zone.id, MapZone.slug == "a-site"
        )
    )
    assert result.scalar_one().polygon_points == []


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_patch_zones_rejects_out_of_range_coords(
    auth_client: AsyncClient, seeded_map_with_zones: Map
):
    """x or y outside [0, 1] is a Pydantic-boundary 422."""
    body = {
        "zones": [
            {
                "slug": "a-site",
                "polygon_points": [
                    {"x": 0.1, "y": 0.1},
                    {"x": 1.2, "y": 0.1},
                    {"x": 0.2, "y": 0.2},
                ],
            }
        ]
    }
    resp = await auth_client.patch(
        f"/api/maps/{seeded_map_with_zones.id}/zones", json=body
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_patch_zones_rejects_empty_zones_list(
    auth_client: AsyncClient, seeded_map_with_zones: Map
):
    """An empty `zones` array is 422 (Pydantic min_length=1).

    Rationale: the caller meant to send at least one update; an empty
    body is almost certainly a client bug, not a deliberate no-op.
    """
    resp = await auth_client.patch(
        f"/api/maps/{seeded_map_with_zones.id}/zones",
        json={"zones": []},
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_patch_zones_unknown_map_404(auth_client: AsyncClient):
    """Patching a map that doesn't exist returns 404 (whole-request)."""
    bogus_id = uuid.uuid4()
    resp = await auth_client.patch(
        f"/api/maps/{bogus_id}/zones",
        json={"zones": [{"slug": "a-site", "polygon_points": []}]},
    )
    assert resp.status_code == 404, resp.text
