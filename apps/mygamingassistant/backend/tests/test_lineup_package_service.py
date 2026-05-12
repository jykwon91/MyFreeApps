"""Unit tests for lineup_package_service CRUD.

Tests verify:
  - create: inserts package + join rows in correct order
  - list_by_filters: filters by game/map/side
  - get: returns None for missing id
  - patch: rename, update lineup_ids, leave lineup_ids unchanged
  - delete: returns True on success, False for missing id
  - get_pin_all: returns ordered lineup_ids
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.game import Game
from app.models.game.lineup import Lineup
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.utility_type import UtilityType
from app.schemas.game.lineup_package_schemas import (
    LineupPackageCreate,
    LineupPackagePatch,
)
from app.services.game import lineup_package_service


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def game_map(db: AsyncSession) -> dict:
    """Minimal Game + Map + zones + utility + two accepted lineups."""
    game = Game(slug="val", name="Valorant", side_a_label="Atk", side_b_label="Def")
    db.add(game)
    await db.flush()

    map_obj = Map(game_id=game.id, slug="bind", name="Bind")
    db.add(map_obj)
    await db.flush()

    zone_a = MapZone(map_id=map_obj.id, slug="a-short", name="A Short", polygon_points=[])
    zone_b = MapZone(map_id=map_obj.id, slug="b-site", name="B Site", polygon_points=[])
    db.add(zone_a)
    db.add(zone_b)
    await db.flush()

    util = UtilityType(game_id=game.id, slug="smoke", name="Smoke")
    db.add(util)
    await db.flush()

    lineup_a = Lineup(
        game_id=game.id,
        map_id=map_obj.id,
        target_zone_id=zone_a.id,
        stand_zone_id=zone_a.id,
        side="side_a",
        utility_type_id=util.id,
        title="Smoke A Short",
        status="accepted",
    )
    lineup_b = Lineup(
        game_id=game.id,
        map_id=map_obj.id,
        target_zone_id=zone_b.id,
        stand_zone_id=zone_b.id,
        side="side_a",
        utility_type_id=util.id,
        title="Smoke B Site",
        status="accepted",
    )
    db.add(lineup_a)
    db.add(lineup_b)
    await db.flush()

    return {
        "game": game,
        "map": map_obj,
        "zone_a": zone_a,
        "zone_b": zone_b,
        "util": util,
        "lineup_a": lineup_a,
        "lineup_b": lineup_b,
    }


# ---------------------------------------------------------------------------
# create
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_package_basic(db: AsyncSession, game_map: dict):
    gd = game_map
    payload = LineupPackageCreate(
        name="Full A exec",
        game_id=gd["game"].id,
        map_id=gd["map"].id,
        side="side_a",
        lineup_ids=[gd["lineup_a"].id, gd["lineup_b"].id],
    )
    pkg = await lineup_package_service.create(db, payload)
    await db.commit()

    assert pkg.name == "Full A exec"
    assert pkg.game_id == gd["game"].id
    assert pkg.map_id == gd["map"].id
    assert pkg.side == "side_a"
    assert len(pkg.lineup_ids) == 2
    assert str(pkg.lineup_ids[0]) == str(gd["lineup_a"].id)
    assert str(pkg.lineup_ids[1]) == str(gd["lineup_b"].id)


@pytest.mark.asyncio
async def test_create_package_empty_lineup_ids(db: AsyncSession, game_map: dict):
    gd = game_map
    payload = LineupPackageCreate(
        name="Empty package",
        game_id=gd["game"].id,
        map_id=gd["map"].id,
        side="any",
        lineup_ids=[],
    )
    pkg = await lineup_package_service.create(db, payload)
    await db.commit()

    assert pkg.lineup_ids == []


# ---------------------------------------------------------------------------
# list_by_filters
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_packages_filters_by_game(db: AsyncSession, game_map: dict):
    gd = game_map
    # Create one package for this game
    payload = LineupPackageCreate(
        name="Test pkg",
        game_id=gd["game"].id,
        map_id=gd["map"].id,
        side="side_a",
    )
    await lineup_package_service.create(db, payload)
    await db.commit()

    # Filter by this game — should return the package
    results = await lineup_package_service.list_by_filters(
        db, game_id=gd["game"].id, map_id=None, side=None
    )
    assert len(results) >= 1
    assert all(str(p.game_id) == str(gd["game"].id) for p in results)


@pytest.mark.asyncio
async def test_list_packages_filters_by_side(db: AsyncSession, game_map: dict):
    gd = game_map
    pkg_a = LineupPackageCreate(
        name="Side A pkg",
        game_id=gd["game"].id,
        map_id=gd["map"].id,
        side="side_a",
    )
    pkg_b = LineupPackageCreate(
        name="Side B pkg",
        game_id=gd["game"].id,
        map_id=gd["map"].id,
        side="side_b",
    )
    await lineup_package_service.create(db, pkg_a)
    await lineup_package_service.create(db, pkg_b)
    await db.commit()

    results = await lineup_package_service.list_by_filters(
        db, game_id=gd["game"].id, map_id=gd["map"].id, side="side_a"
    )
    assert all(p.side == "side_a" for p in results)


# ---------------------------------------------------------------------------
# get
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_package_not_found(db: AsyncSession):
    result = await lineup_package_service.get(db, uuid.uuid4())
    assert result is None


@pytest.mark.asyncio
async def test_get_package_found(db: AsyncSession, game_map: dict):
    gd = game_map
    payload = LineupPackageCreate(
        name="Found pkg",
        game_id=gd["game"].id,
        map_id=gd["map"].id,
        side="side_b",
        lineup_ids=[gd["lineup_a"].id],
    )
    created = await lineup_package_service.create(db, payload)
    await db.commit()

    fetched = await lineup_package_service.get(db, created.id)
    assert fetched is not None
    assert fetched.name == "Found pkg"
    assert len(fetched.lineup_ids) == 1


# ---------------------------------------------------------------------------
# patch
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_patch_package_rename(db: AsyncSession, game_map: dict):
    gd = game_map
    created = await lineup_package_service.create(db, LineupPackageCreate(
        name="Old name",
        game_id=gd["game"].id,
        map_id=gd["map"].id,
        side="side_a",
    ))
    await db.commit()

    patched = await lineup_package_service.patch(
        db, created.id, LineupPackagePatch(name="New name")
    )
    await db.commit()

    assert patched is not None
    assert patched.name == "New name"


@pytest.mark.asyncio
async def test_patch_package_replace_lineup_ids(db: AsyncSession, game_map: dict):
    gd = game_map
    created = await lineup_package_service.create(db, LineupPackageCreate(
        name="Pkg",
        game_id=gd["game"].id,
        map_id=gd["map"].id,
        side="side_a",
        lineup_ids=[gd["lineup_a"].id],
    ))
    await db.commit()

    patched = await lineup_package_service.patch(
        db, created.id,
        LineupPackagePatch(lineup_ids=[gd["lineup_b"].id, gd["lineup_a"].id])
    )
    await db.commit()

    assert patched is not None
    assert len(patched.lineup_ids) == 2
    assert str(patched.lineup_ids[0]) == str(gd["lineup_b"].id)
    assert str(patched.lineup_ids[1]) == str(gd["lineup_a"].id)


@pytest.mark.asyncio
async def test_patch_package_not_found(db: AsyncSession):
    result = await lineup_package_service.patch(
        db, uuid.uuid4(), LineupPackagePatch(name="New")
    )
    assert result is None


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_package(db: AsyncSession, game_map: dict):
    gd = game_map
    created = await lineup_package_service.create(db, LineupPackageCreate(
        name="To delete",
        game_id=gd["game"].id,
        map_id=gd["map"].id,
        side="side_a",
    ))
    await db.commit()

    deleted = await lineup_package_service.delete(db, created.id)
    assert deleted is True

    fetched = await lineup_package_service.get(db, created.id)
    assert fetched is None


@pytest.mark.asyncio
async def test_delete_package_not_found(db: AsyncSession):
    result = await lineup_package_service.delete(db, uuid.uuid4())
    assert result is False


# ---------------------------------------------------------------------------
# get_pin_all
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_pin_all_returns_ordered_lineup_ids(db: AsyncSession, game_map: dict):
    gd = game_map
    created = await lineup_package_service.create(db, LineupPackageCreate(
        name="Pin pkg",
        game_id=gd["game"].id,
        map_id=gd["map"].id,
        side="side_a",
        lineup_ids=[gd["lineup_b"].id, gd["lineup_a"].id],
    ))
    await db.commit()

    pin_all = await lineup_package_service.get_pin_all(db, created.id)
    assert pin_all is not None
    assert len(pin_all.lineup_ids) == 2
    assert str(pin_all.lineup_ids[0]) == str(gd["lineup_b"].id)
    assert str(pin_all.lineup_ids[1]) == str(gd["lineup_a"].id)


@pytest.mark.asyncio
async def test_get_pin_all_not_found(db: AsyncSession):
    result = await lineup_package_service.get_pin_all(db, uuid.uuid4())
    assert result is None
