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
    result = await db.execute(
        select(MapZone).where(MapZone.map_id == map_id, MapZone.slug == slug)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
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
