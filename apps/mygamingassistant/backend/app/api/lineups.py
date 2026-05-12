"""Lineup API routes.

POST /api/lineups/upload-url           — presigned PUT URLs for screenshots
POST /api/lineups                      — create a lineup
GET  /api/lineups                      — list lineups (filterable)
GET  /api/lineups/{id}                 — lineup detail
PATCH /api/lineups/{id}                — update title/notes/zones/side/utility
DELETE /api/lineups/{id}               — soft-delete (status=hidden)
GET  /api/games/{game_slug}/maps/{map_slug}/zone-density  — per-zone counts
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.game.game import Game
from app.models.game.map import Map
from app.models.game.utility_type import UtilityType
from app.models.user.user import User
from app.repositories.game.lineup_repo import LineupFilters
from app.schemas.game.lineup_schemas import (
    LineupCreate,
    LineupPatch,
    LineupRead,
    UploadUrlResponse,
)
from app.services.game import lineup_service

router = APIRouter(prefix="/api", tags=["lineups"])


# ---------------------------------------------------------------------------
# Helper: resolve map by (game_slug, map_slug) — raises 404 on miss
# ---------------------------------------------------------------------------

async def _resolve_map(
    game_slug: str,
    map_slug: str,
    db: AsyncSession,
) -> tuple[Game, Map]:
    game_result = await db.execute(select(Game).where(Game.slug == game_slug))
    game = game_result.scalar_one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    map_result = await db.execute(
        select(Map).where(Map.game_id == game.id, Map.slug == map_slug)
    )
    map_obj = map_result.scalar_one_or_none()
    if map_obj is None:
        raise HTTPException(status_code=404, detail="Map not found")

    return game, map_obj


# ---------------------------------------------------------------------------
# Upload URL endpoint
# ---------------------------------------------------------------------------

@router.post("/lineups/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(
    user: User = Depends(current_active_user),
) -> UploadUrlResponse:
    """Return presigned PUT URLs for stand + aim screenshots.

    The client should:
    1. Call this endpoint to get two PUT URLs + a lineup_id.
    2. Upload both screenshots directly to MinIO via the PUT URLs.
    3. Call POST /api/lineups with the lineup_id + object keys from the response.
    """
    return lineup_service.generate_upload_urls(user.id)


# ---------------------------------------------------------------------------
# Create lineup
# ---------------------------------------------------------------------------

@router.post("/lineups", response_model=LineupRead, status_code=201)
async def create_lineup(
    payload: LineupCreate,
    lineup_id: Optional[uuid.UUID] = Query(
        None, description="Pre-allocated ID from upload-url endpoint"
    ),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> LineupRead:
    """Create a lineup. Pass lineup_id from upload-url to link screenshots."""
    lineup = await lineup_service.create(db, user.id, payload, lineup_id=lineup_id)
    return LineupRead.model_validate(lineup)


# ---------------------------------------------------------------------------
# List lineups
# ---------------------------------------------------------------------------

@router.get("/lineups", response_model=list[LineupRead])
async def list_lineups(
    game_slug: Optional[str] = Query(None),
    map_slug: Optional[str] = Query(None),
    target_zone_slug: Optional[str] = Query(None),
    side: Optional[str] = Query(None, description="side_a, side_b, or any"),
    utility_type_slugs: Optional[str] = Query(
        None, description="Comma-separated utility type slugs"
    ),
    status: Optional[str] = Query(None, description="accepted (default), pending_review, hidden"),
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[LineupRead]:
    """List lineups. By default returns only accepted lineups.

    Filter by game_slug + map_slug to scope to a specific map.
    Filter by target_zone_slug to show lineups for a specific zone.
    side filter uses 'any' semantics: side_a matches side_a and any lineups.
    """
    game_id: Optional[uuid.UUID] = None
    map_id: Optional[uuid.UUID] = None
    target_zone_id: Optional[uuid.UUID] = None
    utility_type_ids: list[uuid.UUID] = []

    if game_slug:
        game_result = await db.execute(select(Game).where(Game.slug == game_slug))
        game = game_result.scalar_one_or_none()
        if game is None:
            return []
        game_id = game.id

        if map_slug:
            map_result = await db.execute(
                select(Map).where(Map.game_id == game_id, Map.slug == map_slug)
            )
            map_obj = map_result.scalar_one_or_none()
            if map_obj is None:
                return []
            map_id = map_obj.id

            if target_zone_slug:
                from app.models.game.map_zone import MapZone

                zone_result = await db.execute(
                    select(MapZone).where(
                        MapZone.map_id == map_id, MapZone.slug == target_zone_slug
                    )
                )
                zone = zone_result.scalar_one_or_none()
                if zone is None:
                    return []
                target_zone_id = zone.id

    if utility_type_slugs and game_id:
        slugs = [s.strip() for s in utility_type_slugs.split(",") if s.strip()]
        if slugs:
            ut_result = await db.execute(
                select(UtilityType).where(
                    UtilityType.game_id == game_id,
                    UtilityType.slug.in_(slugs),
                )
            )
            utility_type_ids = [ut.id for ut in ut_result.scalars().all()]

    # Validate side value
    if side and side not in ("side_a", "side_b", "any"):
        raise HTTPException(status_code=422, detail="side must be side_a, side_b, or any")

    # None for side means no filter; "any" in URL means "don't filter by side"
    side_filter = None if (side is None or side == "any") else side

    filters = LineupFilters(
        game_id=game_id,
        map_id=map_id,
        target_zone_id=target_zone_id,
        side=side_filter,
        utility_type_ids=utility_type_ids,
        status=status if status else "accepted",
    )
    lineups = await lineup_service.list_by_filters(db, filters)
    return [LineupRead.model_validate(l) for l in lineups]


# ---------------------------------------------------------------------------
# Get / patch / delete lineup
# ---------------------------------------------------------------------------

@router.get("/lineups/{lineup_id}", response_model=LineupRead)
async def get_lineup(
    lineup_id: uuid.UUID,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> LineupRead:
    lineup = await lineup_service.get(db, lineup_id)
    if lineup is None:
        raise HTTPException(status_code=404, detail="Lineup not found")
    return LineupRead.model_validate(lineup)


@router.patch("/lineups/{lineup_id}", response_model=LineupRead)
async def patch_lineup(
    lineup_id: uuid.UUID,
    payload: LineupPatch,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> LineupRead:
    lineup = await lineup_service.patch(db, lineup_id, payload)
    if lineup is None:
        raise HTTPException(status_code=404, detail="Lineup not found")
    return LineupRead.model_validate(lineup)


@router.delete("/lineups/{lineup_id}", status_code=204)
async def delete_lineup(
    lineup_id: uuid.UUID,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    lineup = await lineup_service.hide(db, lineup_id)
    if lineup is None:
        raise HTTPException(status_code=404, detail="Lineup not found")


# ---------------------------------------------------------------------------
# Zone density endpoint
# ---------------------------------------------------------------------------

@router.get(
    "/games/{game_slug}/maps/{map_slug}/zone-density",
    response_model=dict,
)
async def get_zone_density(
    game_slug: str,
    map_slug: str,
    side: Optional[str] = Query(None, description="side_a or side_b; omit for both"),
    util: Optional[str] = Query(None, description="Comma-separated utility type slugs"),
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return per-zone lineup counts for the current filter state.

    Response: { "<zone_id>": { "count": 3, "by_utility": {"smoke": 2, "flash": 1} } }

    Used by the plan-mode UI to color-code zone polygons. Returns an empty
    dict {} for zones with zero lineups (client should treat missing zones
    as count=0).
    """
    _game, map_obj = await _resolve_map(game_slug, map_slug, db)

    # Validate side
    if side and side not in ("side_a", "side_b", "any"):
        raise HTTPException(status_code=422, detail="side must be side_a, side_b, or any")
    side_filter = None if (side is None or side == "any") else side

    utility_type_ids: list[uuid.UUID] = []
    if util:
        slugs = [s.strip() for s in util.split(",") if s.strip()]
        if slugs:
            ut_result = await db.execute(
                select(UtilityType).where(
                    UtilityType.game_id == map_obj.game_id,
                    UtilityType.slug.in_(slugs),
                )
            )
            utility_type_ids = [ut.id for ut in ut_result.scalars().all()]

    return await lineup_service.get_zone_density(
        db, map_obj.id, side_filter, utility_type_ids
    )
