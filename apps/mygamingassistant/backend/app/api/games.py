"""Game library read endpoints — public (no auth).

The game taxonomy (games, maps, zones, sites, utility types) is reference data
that's safe to expose publicly. MGA's auth model is public-read / auth-write:
anyone can browse the lineup library, only the operator can manage content.

Routes:
    PUBLIC (no auth):
        GET  /api/games                                — list all games
        GET  /api/games/{game_slug}/maps               — list maps for a game
        GET  /api/games/{game_slug}/maps/{map_slug}    — map detail with zones + sites + utility types

    AUTH (operator only):
        POST /api/maps/{map_id}/minimap-upload-url     — presigned PUT for minimap
        POST /api/maps/{map_id}/minimap                — confirm upload, update Map.minimap_url

See ``apps/mygamingassistant/CLAUDE.md`` → Authentication Model for the
public-read/auth-write rationale (MGA-specific Tier 3 divergence).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.game.game import Game
from app.models.game.map import Map
from app.models.game.map_zone import MapZone  # noqa: F401 — used via selectinload
from app.models.game.site import Site  # noqa: F401 — used via selectinload
from app.models.game.utility_type import UtilityType
from app.models.user.user import User
from app.schemas.game.map_schemas import (
    MapMinimapUpdated,
    MinimapConfirmBody,
    MinimapUploadUrlResponse,
)
from app.services.game import map_service

# Public — game taxonomy reads. Module-export name kept as ``router`` so
# existing main.py wiring (``app.include_router(games.router)``) is unchanged.
router = APIRouter(tags=["games"])

# Operator-only — minimap upload + confirm. Router-level auth dep ensures
# new handlers added here cannot accidentally ship public.
auth_router = APIRouter(
    tags=["games"],
    dependencies=[Depends(current_active_user)],
)


@router.get("/games")
async def list_games(
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
            "minimap_url": map_service.sign_minimap_url(m.minimap_url),
        }
        for m in maps
    ]


@router.get("/games/{game_slug}/maps/{map_slug}")
async def get_map(
    game_slug: str,
    map_slug: str,
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
        "minimap_url": map_service.sign_minimap_url(map_obj.minimap_url),
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


# ===========================================================================
# Auth-required routes — operator only
# ===========================================================================

@auth_router.post(
    "/maps/{map_id}/minimap-upload-url",
    response_model=MinimapUploadUrlResponse,
)
async def get_minimap_upload_url(
    map_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
) -> MinimapUploadUrlResponse:
    """Return a presigned PUT URL for replacing this map's minimap.

    Caller PUTs the image to ``put_url`` (raw body, Content-Type matters
    because the confirm endpoint validates it), then POSTs
    /api/maps/{map_id}/minimap with the returned ``object_key`` to persist.
    """
    map_obj = await db.get(Map, map_id)
    if map_obj is None:
        raise HTTPException(status_code=404, detail="Map not found")

    put_url, object_key = map_service.generate_minimap_upload_url(map_id)
    return MinimapUploadUrlResponse(put_url=put_url, object_key=object_key)


@auth_router.post(
    "/maps/{map_id}/minimap",
    response_model=MapMinimapUpdated,
)
async def confirm_minimap_upload(
    map_id: uuid.UUID,
    body: MinimapConfirmBody,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
) -> MapMinimapUpdated:
    """Confirm a minimap upload completed and persist the object key.

    Validates: object exists in MinIO, size <= 5 MB, allowed image MIME,
    object_key matches the canonical key for this map (cannot repoint at
    arbitrary keys). On success, ``Map.minimap_url`` becomes the object
    key — read paths resolve it to a presigned GET URL via
    ``map_service.sign_minimap_url``.
    """
    map_obj = await db.get(Map, map_id)
    if map_obj is None:
        raise HTTPException(status_code=404, detail="Map not found")

    try:
        map_service.confirm_minimap_upload(map_id, body.object_key)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    map_obj.minimap_url = body.object_key
    await db.flush()
    await db.commit()

    return MapMinimapUpdated(
        map_id=map_id,
        minimap_url=map_service.sign_minimap_url(map_obj.minimap_url),
    )
