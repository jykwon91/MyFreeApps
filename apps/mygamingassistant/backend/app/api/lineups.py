"""Lineup API routes.

Two routers in this module per MGA's public-read / auth-write model:

    ``public_router`` — read-only endpoints anyone can hit:
        GET  /api/lineups                                          — list accepted lineups
        GET  /api/lineups/{id}                                     — accepted lineup detail
        GET  /api/games/{game_slug}/maps/{map_slug}/zone-density   — accepted lineup density

    ``auth_router`` — operator-only mutations + review surfaces:
        POST   /api/lineups/upload-url
        POST   /api/lineups
        GET    /api/lineups/{id}/admin           — operator view: any status
        PATCH  /api/lineups/{id}
        DELETE /api/lineups/{id}
        GET    /api/lineups/pending              — review queue
        POST   /api/lineups/{id}/classify
        POST   /api/lineups/{id}/accept
        POST   /api/lineups/{id}/hide
        POST   /api/lineups/bulk-accept

The public ``GET /api/lineups/{id}`` only returns accepted lineups — pending /
hidden lineups 404 to unauthenticated callers, since their presigned screenshot
URLs are baked into the response by ``lineup_service._build_read`` (which signs
onto the Pydantic model only — never back onto the ORM column). Operators who
need to view a pending/hidden lineup directly use the auth-gated list-pending
endpoint or pass through the existing PATCH/accept flow.

See ``apps/mygamingassistant/CLAUDE.md`` → Authentication Model.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.game.game import Game
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
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
from app.services.game import lineup_service

logger = logging.getLogger(__name__)

# Public read-only routes — no auth required.
public_router = APIRouter(tags=["lineups"])

# Operator-only mutations + review surfaces — auth enforced at the router level
# rather than per-handler so the gating cannot accidentally regress when new
# handlers are added.
auth_router = APIRouter(
    tags=["lineups"],
    dependencies=[Depends(current_active_user)],
)


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


# ===========================================================================
# Public routes — read-only, accepted lineups only
# ===========================================================================

@public_router.get("/lineups", response_model=list[LineupRead])
async def list_lineups(
    game_slug: Optional[str] = Query(None),
    map_slug: Optional[str] = Query(None),
    target_zone_slug: Optional[str] = Query(None),
    side: Optional[str] = Query(None, description="side_a, side_b, or any"),
    utility_type_slugs: Optional[str] = Query(
        None, description="Comma-separated utility type slugs"
    ),
    db: AsyncSession = Depends(get_db),
) -> list[LineupRead]:
    """List accepted lineups. Public — no auth required.

    Always returns only ``status='accepted'`` lineups. Pending and hidden
    lineups are operator-only; surface those via the auth-gated
    ``/api/lineups/pending`` endpoint.

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
        # Public route forces accepted — pending/hidden are operator-only.
        status="accepted",
    )
    return await lineup_service.list_by_filters(db, filters)


@public_router.get("/lineups/{lineup_id}", response_model=LineupRead)
async def get_lineup(
    lineup_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> LineupRead:
    """Get a single accepted lineup. Public — no auth required.

    Returns 404 for pending or hidden lineups when called without auth.
    Operators looking up non-accepted lineups should use the auth-gated
    review queue.
    """
    lineup = await lineup_service.get(db, lineup_id)
    if lineup is None:
        raise HTTPException(status_code=404, detail="Lineup not found")
    if lineup.status != "accepted":
        # Treat non-accepted lineups as not-found from a public POV — they
        # have signed screenshot URLs that shouldn't leak before review.
        raise HTTPException(status_code=404, detail="Lineup not found")
    return lineup


@public_router.get(
    "/games/{game_slug}/maps/{map_slug}/zone-density",
    response_model=dict,
)
async def get_zone_density(
    game_slug: str,
    map_slug: str,
    side: Optional[str] = Query(None, description="side_a or side_b; omit for both"),
    util: Optional[str] = Query(None, description="Comma-separated utility type slugs"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return per-zone lineup counts for the current filter state.

    Public — no auth required. Operates only on accepted lineups (the service
    layer scopes to accepted by default for density queries).

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


# ===========================================================================
# Auth-required routes — operator only
# ===========================================================================

# NOTE on /lineups/pending order:
# FastAPI matches routes top-down. The /lineups/pending review queue must be
# declared BEFORE /lineups/{lineup_id} on the same router; otherwise the path
# converter on {lineup_id} would consume "pending" and 404 with "invalid
# UUID". Both end up on auth_router, so we keep pending near the top.

@auth_router.get("/lineups/pending", response_model=PendingLineupsResponse)
async def list_pending_lineups(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    source_id: Optional[uuid.UUID] = Query(None, description="Filter by source"),
    confidence_max: Optional[float] = Query(
        None, ge=0.0, le=1.0,
        description="Show only lineups with confidence <= this value (or unclassified)",
    ),
    game_slug: Optional[str] = Query(None, description="Filter by game slug"),
    db: AsyncSession = Depends(get_db),
) -> PendingLineupsResponse:
    """List pending_review lineups for the review queue.

    Operator-only. Sorted newest first. Includes classifier suggestions +
    signed screenshot URLs.
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


@auth_router.post("/lineups/upload-url", response_model=UploadUrlResponse)
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


@auth_router.post("/lineups", response_model=LineupRead, status_code=201)
async def create_lineup(
    payload: LineupCreate,
    lineup_id: Optional[uuid.UUID] = Query(
        None, description="Pre-allocated ID from upload-url endpoint"
    ),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> LineupRead:
    """Create a lineup. Pass lineup_id from upload-url to link screenshots."""
    return await lineup_service.create(db, user.id, payload, lineup_id=lineup_id)


@auth_router.get("/lineups/{lineup_id}/admin", response_model=LineupRead)
async def get_lineup_admin(
    lineup_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> LineupRead:
    """Operator-only lineup detail — returns any status (accepted/pending/hidden).

    Used by the review UI to inspect pending lineups before accepting. The
    public ``GET /api/lineups/{id}`` route only returns accepted lineups, so
    this companion endpoint exists to surface non-accepted ones to the
    operator without leaking them publicly.
    """
    lineup = await lineup_service.get(db, lineup_id)
    if lineup is None:
        raise HTTPException(status_code=404, detail="Lineup not found")
    return lineup


@auth_router.patch("/lineups/{lineup_id}", response_model=LineupRead)
async def patch_lineup(
    lineup_id: uuid.UUID,
    payload: LineupPatch,
    db: AsyncSession = Depends(get_db),
) -> LineupRead:
    lineup = await lineup_service.patch(db, lineup_id, payload)
    if lineup is None:
        raise HTTPException(status_code=404, detail="Lineup not found")
    return lineup


@auth_router.delete("/lineups/{lineup_id}", status_code=204)
async def delete_lineup(
    lineup_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    lineup = await lineup_service.hide(db, lineup_id)
    if lineup is None:
        raise HTTPException(status_code=404, detail="Lineup not found")


@auth_router.post("/lineups/{lineup_id}/classify", response_model=ClassifyResponse)
async def reclassify_lineup(
    lineup_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ClassifyResponse:
    """Re-run the Claude classifier on a lineup.

    Updates the suggested_* fields on the lineup row without accepting.
    Returns the new suggestions directly. Persistence (commit) is owned by
    the service/repo layer — this route performs no DB transaction calls.
    """
    result = await lineup_service.reclassify(db, lineup_id)
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
        classification_failures=result.classification_failures,
    )


@auth_router.post("/lineups/{lineup_id}/accept", response_model=LineupRead)
async def accept_lineup(
    lineup_id: uuid.UUID,
    body: LineupAcceptBody = LineupAcceptBody(),
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
    return lineup


@auth_router.post("/lineups/{lineup_id}/hide", response_model=LineupRead)
async def hide_pending_lineup(
    lineup_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> LineupRead:
    """Soft-delete a lineup by setting status to 'hidden'."""
    hidden = await lineup_service.hide(db, lineup_id)
    if hidden is None:
        raise HTTPException(status_code=404, detail="Lineup not found")
    return hidden


@auth_router.post("/lineups/bulk-accept", response_model=list[LineupRead])
async def bulk_accept_lineups(
    body: BulkAcceptBody,
    db: AsyncSession = Depends(get_db),
) -> list[LineupRead]:
    """Accept multiple pending lineups in a single request.

    Processes each lineup individually; failures on individual lineups are
    skipped (logged) and do NOT abort the batch. Returns only the
    successfully accepted lineups.

    Partial-success durability: ``lineup_service.accept`` → the repo's
    ``accept_lineup`` owns a per-lineup commit/rollback. A failing lineup's
    rollback discards only its own uncommitted unit — lineups committed by
    earlier loop iterations are already durable in PostgreSQL and survive.
    The route performs no DB transaction calls of its own.
    """
    accepted: list[LineupRead] = []
    for lid in body.lineup_ids:
        patch = body.patches.get(str(lid), LineupAcceptBody())
        try:
            lineup = await lineup_service.accept(db, lid, patch)
            if lineup is not None:
                accepted.append(lineup)
        except Exception as exc:
            logger.warning(
                "bulk_accept: skipping lineup_id=%s error=%s", lid, str(exc)
            )
    return accepted
