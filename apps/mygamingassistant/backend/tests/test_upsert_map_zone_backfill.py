"""Tests for game_repo.upsert_map_zone backfill behavior (Task 6).

upsert_map_zone is the idempotent zone loader. The backfill rule:

  - zone missing                         → insert with the fixture polygon
  - zone exists, polygon EMPTY, fixture
    provides a non-empty polygon         → backfill the existing row
  - zone exists, polygon NON-EMPTY       → NEVER overwrite (protects
    operator-drawn polygons / the #656 editor) — even if the fixture has
    a different polygon
  - re-running once populated            → no-op (idempotent)
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.game import Game
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.repositories.game import game_repo

POLY_A = [{"x": 0.1, "y": 0.1}, {"x": 0.2, "y": 0.1}, {"x": 0.2, "y": 0.2}]
POLY_B = [{"x": 0.8, "y": 0.8}, {"x": 0.9, "y": 0.8}, {"x": 0.9, "y": 0.9}]


@pytest_asyncio.fixture
async def map_obj(db: AsyncSession) -> Map:
    game = Game(slug="bf-game", name="BF", side_a_label="T", side_b_label="CT")
    db.add(game)
    await db.flush()
    m = Map(game_id=game.id, slug="bf-map", name="BF Map")
    db.add(m)
    await db.flush()
    return m


async def _reload(db: AsyncSession, zone_id) -> MapZone:
    db.expire_all()
    return (
        await db.execute(select(MapZone).where(MapZone.id == zone_id))
    ).scalar_one()


@pytest.mark.asyncio
async def test_inserts_when_zone_missing(db: AsyncSession, map_obj: Map):
    zone = await game_repo.upsert_map_zone(
        db, map_id=map_obj.id, slug="a", name="A", polygon_points=POLY_A
    )
    fresh = await _reload(db, zone.id)
    assert fresh.polygon_points == POLY_A


@pytest.mark.asyncio
async def test_backfills_empty_existing_polygon(db: AsyncSession, map_obj: Map):
    """Existing zone with [] polygon gets the fixture polygon written in."""
    existing = MapZone(map_id=map_obj.id, slug="a", name="A", polygon_points=[])
    db.add(existing)
    await db.flush()
    zone_id = existing.id

    result = await game_repo.upsert_map_zone(
        db, map_id=map_obj.id, slug="a", name="A", polygon_points=POLY_A
    )
    assert result.id == zone_id  # same row, not a new insert
    fresh = await _reload(db, zone_id)
    assert fresh.polygon_points == POLY_A


@pytest.mark.asyncio
async def test_never_overwrites_non_empty_polygon(db: AsyncSession, map_obj: Map):
    """An operator-drawn (non-empty) polygon must survive a fixture re-load."""
    existing = MapZone(
        map_id=map_obj.id, slug="a", name="A", polygon_points=POLY_A
    )
    db.add(existing)
    await db.flush()
    zone_id = existing.id

    # Fixture provides a DIFFERENT polygon — must be ignored.
    result = await game_repo.upsert_map_zone(
        db, map_id=map_obj.id, slug="a", name="A", polygon_points=POLY_B
    )
    assert result.id == zone_id
    fresh = await _reload(db, zone_id)
    assert fresh.polygon_points == POLY_A  # unchanged


@pytest.mark.asyncio
async def test_backfill_is_idempotent(db: AsyncSession, map_obj: Map):
    """Running the backfill twice produces the same result and no clobber."""
    existing = MapZone(map_id=map_obj.id, slug="a", name="A", polygon_points=[])
    db.add(existing)
    await db.flush()
    zone_id = existing.id

    await game_repo.upsert_map_zone(
        db, map_id=map_obj.id, slug="a", name="A", polygon_points=POLY_A
    )
    # Second run with the SAME fixture — polygon already populated, no-op.
    await game_repo.upsert_map_zone(
        db, map_id=map_obj.id, slug="a", name="A", polygon_points=POLY_A
    )
    fresh = await _reload(db, zone_id)
    assert fresh.polygon_points == POLY_A


@pytest.mark.asyncio
async def test_empty_fixture_does_not_touch_empty_zone(
    db: AsyncSession, map_obj: Map
):
    """An empty incoming polygon must not 'backfill' anything."""
    existing = MapZone(map_id=map_obj.id, slug="a", name="A", polygon_points=[])
    db.add(existing)
    await db.flush()
    zone_id = existing.id

    result = await game_repo.upsert_map_zone(
        db, map_id=map_obj.id, slug="a", name="A", polygon_points=[]
    )
    assert result.id == zone_id
    fresh = await _reload(db, zone_id)
    assert fresh.polygon_points == []
