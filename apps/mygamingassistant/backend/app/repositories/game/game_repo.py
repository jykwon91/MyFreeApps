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

from app.models.game.agent import Agent
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
    agent_id: uuid.UUID | None = None,
) -> UtilityType:
    result = await db.execute(
        select(UtilityType).where(UtilityType.game_id == game_id, UtilityType.slug == slug)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        # Re-running load-fixtures must propagate fixture edits. (game_id, slug)
        # is the natural key; ``name`` + ``agent_id`` are mutable. Crucially
        # this backfills ``agent_id`` onto utility types that pre-date the agent
        # dimension — without it the existing Sova ``recon``/``shock`` rows keep
        # ``agent_id = NULL`` and the agent filter silently matches nothing.
        changed = False
        if existing.name != name:
            existing.name = name
            changed = True
        if existing.agent_id != agent_id:
            existing.agent_id = agent_id
            changed = True
        if changed:
            await db.flush()
        return existing
    ut = UtilityType(game_id=game_id, slug=slug, name=name, agent_id=agent_id)
    db.add(ut)
    await db.flush()
    return ut


# ---------------------------------------------------------------------------
# Agent (Valorant only — CS2 seeds no agents)
# ---------------------------------------------------------------------------

async def list_agents_for_game(
    db: AsyncSession, game_id: uuid.UUID
) -> Sequence[Agent]:
    result = await db.execute(
        select(Agent).where(Agent.game_id == game_id).order_by(Agent.name)
    )
    return result.scalars().all()


async def get_agent_by_slug(
    db: AsyncSession, game_id: uuid.UUID, slug: str
) -> Agent | None:
    result = await db.execute(
        select(Agent).where(Agent.game_id == game_id, Agent.slug == slug)
    )
    return result.scalar_one_or_none()


async def upsert_agent(
    db: AsyncSession,
    *,
    game_id: uuid.UUID,
    slug: str,
    name: str,
    role: str | None = None,
) -> Agent:
    existing = await get_agent_by_slug(db, game_id, slug)
    if existing is not None:
        changed = False
        if existing.name != name:
            existing.name = name
            changed = True
        if existing.role != role:
            existing.role = role
            changed = True
        if changed:
            await db.flush()
        return existing
    agent = Agent(game_id=game_id, slug=slug, name=name, role=role)
    db.add(agent)
    await db.flush()
    return agent


# ---------------------------------------------------------------------------
# Map
# ---------------------------------------------------------------------------

async def get_map(db: AsyncSession, map_id: uuid.UUID) -> Map | None:
    """Return a single Map by primary key, or None."""
    return await db.get(Map, map_id)


async def set_minimap_url(
    db: AsyncSession, *, map_obj: Map, object_key: str
) -> Map:
    """Persist a new ``minimap_url`` on *map_obj*, commit, and return it.

    Transaction ownership lives here in the repository layer (mirrors
    ``lineup_repo`` per PR #687): ``platform_shared.db.session.get_db`` does
    NOT auto-commit, so a flush-only write is rolled back when the request
    session closes. Routes/services delegating here must NOT also commit. On
    failure the transaction is rolled back and the error re-raised so the
    caller can surface it.
    """
    map_obj.minimap_url = object_key
    try:
        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return map_obj


async def commit_zone_polygon_updates(db: AsyncSession) -> None:
    """Commit the flushed bulk zone-polygon writes.

    ``update_zone_polygons_bulk`` flushes per-zone changes but, per its
    documented contract, leaves the commit to the caller. Transaction
    ownership for the ``PATCH /api/maps/{map_id}/zones`` path lives here in
    the repo layer — the route/service must NOT commit. On failure the
    transaction is rolled back and the error re-raised.
    """
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise


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
    force_polygon: bool = False,
) -> MapZone:
    """Insert a zone if missing; backfill/refresh its polygon per the rules below.

    Polygon write rule (idempotent, conservative):
    - existing + EMPTY stored polygon + non-empty incoming → write incoming
      (the fixture-backfill case; always applies).
    - existing + NON-EMPTY stored polygon + non-empty incoming → write incoming
      ONLY when ``force_polygon=True``.
    - a non-empty stored polygon is NEVER cleared to empty (a falsy incoming
      is ignored), regardless of ``force_polygon``.

    ``load-fixtures`` leaves ``force_polygon=False`` so operator-drawn polygons
    (the #656 zone editor) are never clobbered by a re-run. The library
    IMPORTER (``lineup_importer``) passes ``force_polygon=True`` because the
    published pack is the authoritative source for prod's serve-only library —
    a polygon the operator refined locally must reach prod, where there is no
    editor to redraw it.
    """
    result = await db.execute(
        select(MapZone).where(MapZone.map_id == map_id, MapZone.slug == slug)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        if polygon_points and (force_polygon or not existing.polygon_points):
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


async def get_utility_type_by_slug(
    db: AsyncSession, game_id: uuid.UUID, slug: str
) -> UtilityType | None:
    """Return the (game_id, slug) utility type, or None.

    Used by the library importer to resolve a pack lineup's
    ``utility_type_slug`` to the prod-side UUID. Utility types are seeded by
    ``load-fixtures`` (which runs before import), so a None here means the
    fixtures were not loaded — the importer treats that as a hard error.
    """
    result = await db.execute(
        select(UtilityType).where(
            UtilityType.game_id == game_id, UtilityType.slug == slug
        )
    )
    return result.scalar_one_or_none()


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
