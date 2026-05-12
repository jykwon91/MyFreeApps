"""Game library read endpoints — stub implementations for PR 1.

All routes require authentication. Write endpoints (upload, review, packages)
are implemented in Phase 2+ PRs.

Routes:
    GET /api/games                          — list all games
    GET /api/games/{game_slug}/maps         — list maps for a game
    GET /api/games/{game_slug}/maps/{map_slug} — map detail with zones + sites + utility types
    GET /api/lineups                        — empty list (no lineups yet)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.game.game import Game
from app.models.game.lineup import Lineup
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.site import Site
from app.models.game.utility_type import UtilityType
from app.models.user.user import User

router = APIRouter(prefix="/api", tags=["games"])


@router.get("/games")
async def list_games(
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List all games seeded in the database."""
    result = await db.execute(select(Game).order_by(Game.name))
    games = result.scalars().all()
    return [
        {
            "id": str(g.id),
            "slug": g.slug,
            "name": g.name,
            "side_a_label": g.side_a_label,
            "side_b_label": g.side_b_label,
        }
        for g in games
    ]


@router.get("/games/{game_slug}/maps")
async def list_maps(
    game_slug: str,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List all maps for a given game slug."""
    game_result = await db.execute(select(Game).where(Game.slug == game_slug))
    game = game_result.scalar_one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    result = await db.execute(
        select(Map).where(Map.game_id == game.id).order_by(Map.name)
    )
    maps = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "slug": m.slug,
            "name": m.name,
            "minimap_url": m.minimap_url,
        }
        for m in maps
    ]


@router.get("/games/{game_slug}/maps/{map_slug}")
async def get_map(
    game_slug: str,
    map_slug: str,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Map detail: zones, sites, and utility types for the game."""
    game_result = await db.execute(select(Game).where(Game.slug == game_slug))
    game = game_result.scalar_one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    map_result = await db.execute(
        select(Map)
        .where(Map.game_id == game.id, Map.slug == map_slug)
        .options(selectinload(Map.zones), selectinload(Map.sites))
    )
    map_obj = map_result.scalar_one_or_none()
    if map_obj is None:
        raise HTTPException(status_code=404, detail="Map not found")

    util_result = await db.execute(
        select(UtilityType).where(UtilityType.game_id == game.id).order_by(UtilityType.name)
    )
    utility_types = util_result.scalars().all()

    return {
        "id": str(map_obj.id),
        "slug": map_obj.slug,
        "name": map_obj.name,
        "minimap_url": map_obj.minimap_url,
        "zones": [
            {
                "id": str(z.id),
                "slug": z.slug,
                "name": z.name,
                "polygon_points": z.polygon_points,
            }
            for z in map_obj.zones
        ],
        "sites": [
            {"id": str(s.id), "slug": s.slug, "name": s.name}
            for s in map_obj.sites
        ],
        "utility_types": [
            {"id": str(u.id), "slug": u.slug, "name": u.name}
            for u in utility_types
        ],
    }


@router.get("/lineups")
async def list_lineups(
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List accepted lineups. Phase 1 stub — always returns empty list.

    Phase 2 will add game_slug/map_slug/side/utility_type filters and
    populate lineups from the DB.
    """
    # TODO Phase 2: query accepted lineups with filters
    return []
