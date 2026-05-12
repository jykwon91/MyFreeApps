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
    BulkAcceptBody,
    ClassifyResponse,
    LineupAcceptBody,
    LineupCreate,
    LineupPatch,
    LineupRead,
    PendingLineupsResponse,
    UploadUrlResponse,
)
from app.services.classification.classifier_service import classify_lineup
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
# Review queue endpoints (PR 5)
# ---------------------------------------------------------------------------

@router.get("/lineups/pending", response_model=PendingLineupsResponse)
async def list_pending_lineups(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    source_id: Optional[uuid.UUID] = Query(None, description="Filter by source"),
    confidence_max: Optional[float] = Query(
        None, ge=0.0, le=1.0,
        description="Show only lineups with confidence <= this value (or unclassified)",
    ),
    game_slug: Optional[str] = Query(None, description="Filter by game slug"),
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> PendingLineupsResponse:
    """List pending_review lineups for the review queue.

    Sorted newest first. Includes classifier suggestions + signed screenshot URLs.
    """
    game_id: Optional[uuid.UUID] = None
    if game_slug:
        game_result = await db.execute(select(Game).where(Game.slug == game_slug))
        game = game_result.scalar_one_or_none()
        if game is not None:
            game_id = game.id

    return await lineup_service.get_pending(
        db,
        limit=limit,
        offset=offset,
        source_id=source_id,
        confidence_max=confidence_max,
        game_id=game_id,
    )


@router.post("/lineups/{lineup_id}/classify", response_model=ClassifyResponse)
async def reclassify_lineup(
    lineup_id: uuid.UUID,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ClassifyResponse:
    """Re-run the Claude classifier on a lineup.

    Updates the suggested_* fields on the lineup row without accepting.
    Returns the new suggestions directly.
    """
    result = await classify_lineup(db, lineup_id)
    if result.success:
        await db.commit()
    return ClassifyResponse(
        lineup_id=lineup_id,
        success=result.success,
        suggested_game_id=result.suggested_game_id,
        suggested_map_id=result.suggested_map_id,
        suggested_target_zone_id=result.suggested_target_zone_id,
        suggested_stand_zone_id=result.suggested_stand_zone_id,
        suggested_side=result.suggested_side,
        suggested_utility_type_id=result.suggested_utility_type_id,
        aim_anchor_x=result.aim_anchor_x,
        aim_anchor_y=result.aim_anchor_y,
        confidence=result.confidence,
        reasoning=result.reasoning,
        error_codes=result.error_codes,
    )


@router.post("/lineups/{lineup_id}/accept", response_model=LineupRead)
async def accept_lineup(
    lineup_id: uuid.UUID,
    body: LineupAcceptBody = LineupAcceptBody(),
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> LineupRead:
    """Accept a pending lineup, transitioning it to 'accepted' status.

    Optional body overrides any classification fields before accepting.
    Missing required fields (target_zone_id, stand_zone_id, side, utility_type_id)
    must be provided either via classifier suggestions or in this body.
    """
    try:
        lineup = await lineup_service.accept(db, lineup_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if lineup is None:
        raise HTTPException(status_code=404, detail="Lineup not found")
    await db.commit()
    return LineupRead.model_validate(lineup)


@router.post("/lineups/{lineup_id}/hide", response_model=LineupRead)
async def hide_pending_lineup(
    lineup_id: uuid.UUID,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> LineupRead:
    """Soft-delete a lineup by setting status to 'hidden'."""
    from app.repositories.game.lineup_repo import get_lineup, hide_lineup

    lineup = await get_lineup(db, lineup_id)
    if lineup is None:
        raise HTTPException(status_code=404, detail="Lineup not found")
    hidden = await hide_lineup(db, lineup)
    await db.commit()
    return LineupRead.model_validate(hidden)


@router.post("/lineups/bulk-accept", response_model=list[LineupRead])
async def bulk_accept_lineups(
    body: BulkAcceptBody,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[LineupRead]:
    """Accept multiple pending lineups in a single request.

    Processes each lineup individually; failures on individual lineups are
    returned as 207 partial success (accepted ones are in the response list).
    Currently returns only successfully accepted lineups.
    """
    accepted: list[LineupRead] = []
    for lid in body.lineup_ids:
        patch = body.patches.get(str(lid), LineupAcceptBody())
        try:
            lineup = await lineup_service.accept(db, lid, patch)
            if lineup is not None:
                await db.commit()
                accepted.append(LineupRead.model_validate(lineup))
        except (ValueError, Exception) as exc:
            import logging as _logging
            _logging.getLogger(__name__).warning(
                "bulk_accept: skipping lineup_id=%s error=%s", lid, str(exc)
            )
            await db.rollback()
    return accepted


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
