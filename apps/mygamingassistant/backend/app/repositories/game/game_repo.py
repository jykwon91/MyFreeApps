"""Game domain repository — data access layer.

All ORM operations for the game domain live here. Services and CLI utilities
delegate to this module; no direct ``db.add / db.execute / db.flush`` should
appear outside of repository files.
"""
from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game.game import Game
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.site import Site
from app.models.game.utility_type import UtilityType


# ---------------------------------------------------------------------------
# Game
# ---------------------------------------------------------------------------

async def get_game_by_slug(db: AsyncSession, slug: str) -> Game | None:
    result = await db.execute(select(Game).where(Game.slug == slug))
    return result.scalar_one_or_none()


async def list_games(db: AsyncSession) -> Sequence[Game]:
    result = await db.execute(select(Game).order_by(Game.name))
    return result.scalars().all()


async def upsert_game(
    db: AsyncSession,
    *,
    slug: str,
    name: str,
    side_a_label: str,
    side_b_label: str,
) -> Game:
    """Insert a game if it doesn't exist; return the existing row if it does."""
    existing = await get_game_by_slug(db, slug)
    if existing is not None:
        return existing
    game = Game(slug=slug, name=name, side_a_label=side_a_label, side_b_label=side_b_label)
    db.add(game)
    await db.flush()
    return game


# ---------------------------------------------------------------------------
# UtilityType
# ---------------------------------------------------------------------------

async def list_utility_types_for_game(
    db: AsyncSession, game_id: uuid.UUID
) -> Sequence[UtilityType]:
    result = await db.execute(
        select(UtilityType).where(UtilityType.game_id == game_id).order_by(UtilityType.name)
    )
    return result.scalars().all()


async def upsert_utility_type(
    db: AsyncSession,
    *,
    game_id: uuid.UUID,
    slug: str,
    name: str,
) -> UtilityType:
    result = await db.execute(
        select(UtilityType).where(UtilityType.game_id == game_id, UtilityType.slug == slug)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing
    ut = UtilityType(game_id=game_id, slug=slug, name=name)
    db.add(ut)
    await db.flush()
    return ut


# ---------------------------------------------------------------------------
# Map
# ---------------------------------------------------------------------------

async def get_map_by_slug(
    db: AsyncSession, game_id: uuid.UUID, slug: str
) -> Map | None:
    result = await db.execute(
        select(Map).where(Map.game_id == game_id, Map.slug == slug)
    )
    return result.scalar_one_or_none()


async def list_maps_for_game(
    db: AsyncSession, game_id: uuid.UUID
) -> Sequence[Map]:
    result = await db.execute(
        select(Map).where(Map.game_id == game_id).order_by(Map.name)
    )
    return result.scalars().all()


async def get_map_detail(
    db: AsyncSession, game_id: uuid.UUID, slug: str
) -> Map | None:
    """Return a Map with zones, sites, and utility_types eagerly loaded."""
    result = await db.execute(
        select(Map)
        .where(Map.game_id == game_id, Map.slug == slug)
        .options(
            selectinload(Map.zones),
            selectinload(Map.sites),
        )
    )
    return result.scalar_one_or_none()


async def upsert_map(
    db: AsyncSession,
    *,
    game_id: uuid.UUID,
    slug: str,
    name: str,
    minimap_url: str | None = None,
) -> Map:
    existing = await get_map_by_slug(db, game_id, slug)
    if existing is not None:
        # Re-running load-fixtures after a fixture edit must propagate the
        # change. Update mutable fields; (game_id, slug) is the natural key
        # and stays put.
        if existing.name != name:
            existing.name = name
        if existing.minimap_url != minimap_url:
            existing.minimap_url = minimap_url
        await db.flush()
        return existing
    m = Map(game_id=game_id, slug=slug, name=name, minimap_url=minimap_url)
    db.add(m)
    await db.flush()
    return m


# ---------------------------------------------------------------------------
# MapZone
# ---------------------------------------------------------------------------

async def upsert_map_zone(
    db: AsyncSession,
    *,
    map_id: uuid.UUID,
    slug: str,
    name: str,
    polygon_points: list[list[float]] | None = None,
) -> MapZone:
    """Insert a zone if missing; backfill an empty polygon if the fixture has one.

    Backfill rule (idempotent, conservative):
    - The (map_id, slug) zone already exists, AND
    - its stored ``polygon_points`` is empty/falsy, AND
    - the incoming ``polygon_points`` is non-empty
      → write the incoming polygon onto the existing row and flush.

    A zone that already has a non-empty polygon is NEVER overwritten — this
    protects operator-drawn polygons (the #656 zone editor) from being
    clobbered by a re-run of ``load-fixtures``. Re-running with the same
    fixture is a no-op once the polygon is populated.
    """
    result = await db.execute(
        select(MapZone).where(MapZone.map_id == map_id, MapZone.slug == slug)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        if not existing.polygon_points and polygon_points:
            existing.polygon_points = polygon_points
            await db.flush()
        return existing
    zone = MapZone(
        map_id=map_id,
        slug=slug,
        name=name,
        polygon_points=polygon_points or [],
    )
    db.add(zone)
    await db.flush()
    return zone


async def update_zone_polygons_bulk(
    db: AsyncSession,
    *,
    map_id: uuid.UUID,
    updates: list[tuple[str, list[dict[str, float]]]],
) -> tuple[list[str], list[tuple[str, str]]]:
    """Bulk-update polygon_points across multiple MapZones for one map.

    Validation rules (per-zone, failures recorded — never raise):
    - The zone slug must exist within this map (cross-map slugs rejected).
    - ``polygon_points`` may be empty (clears the polygon, zone becomes
      invisible/unclickable in plan mode) OR have >=3 entries.
    - 1 or 2 points → rejected as "polygon needs 3+ vertices".

    Caller is responsible for committing.

    Returns
    -------
    tuple[list[str], list[tuple[str, str]]]
        ``(updated_slugs, [(failed_slug, reason)])`` — partial successes are
        normal and reflected by both lists having entries.
    """
    result = await db.execute(select(MapZone).where(MapZone.map_id == map_id))
    zones_by_slug = {z.slug: z for z in result.scalars().all()}

    updated: list[str] = []
    failed: list[tuple[str, str]] = []

    for slug, points in updates:
        zone = zones_by_slug.get(slug)
        if zone is None:
            failed.append((slug, "zone slug not found on this map"))
            continue
        if 0 < len(points) < 3:
            failed.append((slug, f"polygon needs 3+ vertices (got {len(points)})"))
            continue
        zone.polygon_points = points
        updated.append(slug)

    await db.flush()
    return updated, failed


# ---------------------------------------------------------------------------
# Site
# ---------------------------------------------------------------------------

async def upsert_site(
    db: AsyncSession,
    *,
    map_id: uuid.UUID,
    slug: str,
    name: str,
) -> Site:
    result = await db.execute(
        select(Site).where(Site.map_id == map_id, Site.slug == slug)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing
    site = Site(map_id=map_id, slug=slug, name=name)
    db.add(site)
    await db.flush()
    return site
