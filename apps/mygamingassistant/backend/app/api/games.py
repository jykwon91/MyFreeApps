"""Game library read endpoints — public (no auth).

The game taxonomy (games, maps, zones, sites, utility types) is reference data
that's safe to expose publicly. MGA's auth model is public-read / auth-write:
anyone can browse the lineup library, only the operator can manage content.

Routes:
    PUBLIC (no auth):
        GET   /api/games                                — list all games
        GET   /api/games/{game_slug}/maps               — list maps for a game
        GET   /api/games/{game_slug}/maps/{map_slug}    — map detail with zones + sites + utility types

    AUTH (operator only):
        POST  /api/maps/{map_id}/minimap-upload-url     — presigned PUT for minimap
        POST  /api/maps/{map_id}/minimap                — confirm upload, update Map.minimap_url
        PATCH /api/maps/{map_id}/zones                  — bulk update zone polygons

Handlers are thin: reads delegate to ``game_repo``, writes to ``map_service``.
No ORM / DB primitives are imported here (layered architecture, see
``apps/mygamingassistant/CLAUDE.md`` → Architecture Rules). Transaction
ownership for the mutating routes lives in the repository layer (PR #687
precedent).

See ``apps/mygamingassistant/CLAUDE.md`` → Authentication Model for the
public-read/auth-write rationale (MGA-specific Tier 3 divergence).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.repositories.game import game_repo
from app.schemas.game.map_schemas import (
    BulkUpdateZonesBody,
    BulkUpdateZonesResult,
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
    games = await game_repo.list_games(db)
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
    game = await game_repo.get_game_by_slug(db, game_slug)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    maps = await game_repo.list_maps_for_game(db, game.id)
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
    game = await game_repo.get_game_by_slug(db, game_slug)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    map_obj = await game_repo.get_map_detail(db, game.id, map_slug)
    if map_obj is None:
        raise HTTPException(status_code=404, detail="Map not found")

    utility_types = await game_repo.list_utility_types_for_game(db, game.id)

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
    map_obj = await game_repo.get_map(db, map_id)
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
    ``map_service.sign_minimap_url``. Validation + persistence + commit are
    owned by the service / repo layer.
    """
    return await map_service.confirm_minimap_upload(db, map_id, body.object_key)


@auth_router.patch(
    "/maps/{map_id}/zones",
    response_model=BulkUpdateZonesResult,
)
async def update_map_zones(
    map_id: uuid.UUID,
    body: BulkUpdateZonesBody,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
) -> BulkUpdateZonesResult:
    """Bulk-update polygon_points for one or more zones on a map.

    Per-zone validation failures are returned in the ``failed`` array (HTTP
    200) rather than 422-ing the whole request — operators commonly leave
    a 1-2 point polygon mid-draw, and we shouldn't make them lose the rest
    of their session because one zone is half-finished. Whole-request
    errors (auth, unknown map) still use the standard HTTP error codes.
    """
    return await map_service.update_map_zones(db, map_id, body)
