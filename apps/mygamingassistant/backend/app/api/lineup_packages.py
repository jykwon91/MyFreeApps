"""LineupPackage CRUD API.

Two routers per MGA's public-read / auth-write model:

    ``public_router``:
        GET  /api/lineup-packages?game_id={}&map_id={}&side={}
        GET  /api/lineup-packages/{id}
        POST /api/lineup-packages/{id}/pin   — returns lineup_ids; no server state changes

    ``auth_router`` (operator only):
        POST   /api/lineup-packages
        PATCH  /api/lineup-packages/{id}
        DELETE /api/lineup-packages/{id}

The ``/pin`` endpoint is a POST by convention (intent: "do something") but it
mutates nothing server-side — the response payload is consumed by the client's
localStorage ``usePins`` hook. It's safe to expose publicly so a non-operator
viewer can pin a curated package for their own session.

Note on filtering: query params accept UUID values for game_id / map_id.
The frontend has these IDs from the game/map detail queries.

See ``apps/mygamingassistant/CLAUDE.md`` → Authentication Model.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.schemas.game.lineup_package_schemas import (
    LineupPackageCreate,
    LineupPackagePatch,
    LineupPackageRead,
    PinAllResponse,
)
from app.services.game import lineup_package_service

# Public read-only routes — no auth required.
public_router = APIRouter(tags=["lineup-packages"])

# Operator-only mutations — auth enforced at router level.
auth_router = APIRouter(
    tags=["lineup-packages"],
    dependencies=[Depends(current_active_user)],
)


# ===========================================================================
# Public routes
# ===========================================================================

@public_router.get("/lineup-packages", response_model=list[LineupPackageRead])
async def list_lineup_packages(
    game_id: Optional[uuid.UUID] = Query(None),
    map_id: Optional[uuid.UUID] = Query(None),
    side: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[LineupPackageRead]:
    """List packages, optionally filtered by game / map / side. Public."""
    return await lineup_package_service.list_by_filters(db, game_id, map_id, side)


@public_router.get("/lineup-packages/{package_id}", response_model=LineupPackageRead)
async def get_lineup_package(
    package_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> LineupPackageRead:
    """Get a single package by id. Public."""
    pkg = await lineup_package_service.get(db, package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return pkg


@public_router.post("/lineup-packages/{package_id}/pin", response_model=PinAllResponse)
async def pin_all_lineup_package(
    package_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> PinAllResponse:
    """Return lineup_ids for client-side pin-all.

    Pins live in localStorage (``usePins`` hook). This endpoint returns the
    ordered lineup_ids so the frontend can iterate and pin each in their
    own browser. No server state is modified, so it's safe to expose publicly.
    """
    result = await lineup_package_service.get_pin_all(db, package_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return result


# ===========================================================================
# Auth-required routes
# ===========================================================================

@auth_router.post("/lineup-packages", response_model=LineupPackageRead, status_code=201)
async def create_lineup_package(
    payload: LineupPackageCreate,
    db: AsyncSession = Depends(get_db),
) -> LineupPackageRead:
    """Create a new lineup package."""
    try:
        pkg = await lineup_package_service.create(db, payload)
        await db.commit()
        return pkg
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@auth_router.patch("/lineup-packages/{package_id}", response_model=LineupPackageRead)
async def patch_lineup_package(
    package_id: uuid.UUID,
    payload: LineupPackagePatch,
    db: AsyncSession = Depends(get_db),
) -> LineupPackageRead:
    """Rename, change side, or replace lineup list for a package.

    Provide ``lineup_ids`` in the desired order to replace the current
    lineup list. Omit to leave lineups unchanged.
    """
    try:
        pkg = await lineup_package_service.patch(db, package_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    await db.commit()
    return pkg


@auth_router.delete("/lineup-packages/{package_id}", status_code=204)
async def delete_lineup_package(
    package_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Hard-delete a package. Lineups themselves are not affected."""
    deleted = await lineup_package_service.delete(db, package_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Package not found")
    await db.commit()


