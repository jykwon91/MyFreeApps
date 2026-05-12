"""LineupPackage CRUD API.

GET  /api/lineup-packages?game_id={}&map_id={}&side={} — list
POST /api/lineup-packages                              — create
GET  /api/lineup-packages/{id}                         — detail
PATCH /api/lineup-packages/{id}                        — rename / update lineups
DELETE /api/lineup-packages/{id}                       — hard delete
POST /api/lineup-packages/{id}/pin                     — return lineup_ids for client pin-all

Note on filtering: query params accept UUID values for game_id / map_id.
The frontend has these IDs from the game/map detail queries.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.game.lineup_package_schemas import (
    LineupPackageCreate,
    LineupPackagePatch,
    LineupPackageRead,
    PinAllResponse,
)
from app.services.game import lineup_package_service

router = APIRouter(prefix="/api", tags=["lineup-packages"])


@router.get("/lineup-packages", response_model=list[LineupPackageRead])
async def list_lineup_packages(
    game_id: Optional[uuid.UUID] = Query(None),
    map_id: Optional[uuid.UUID] = Query(None),
    side: Optional[str] = Query(None),
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[LineupPackageRead]:
    """List packages, optionally filtered by game / map / side."""
    return await lineup_package_service.list_by_filters(db, game_id, map_id, side)


@router.post("/lineup-packages", response_model=LineupPackageRead, status_code=201)
async def create_lineup_package(
    payload: LineupPackageCreate,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> LineupPackageRead:
    """Create a new lineup package."""
    try:
        pkg = await lineup_package_service.create(db, payload)
        await db.commit()
        return pkg
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/lineup-packages/{package_id}", response_model=LineupPackageRead)
async def get_lineup_package(
    package_id: uuid.UUID,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> LineupPackageRead:
    """Get a single package by id."""
    pkg = await lineup_package_service.get(db, package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return pkg


@router.patch("/lineup-packages/{package_id}", response_model=LineupPackageRead)
async def patch_lineup_package(
    package_id: uuid.UUID,
    payload: LineupPackagePatch,
    _user: User = Depends(current_active_user),
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


@router.delete("/lineup-packages/{package_id}", status_code=204)
async def delete_lineup_package(
    package_id: uuid.UUID,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Hard-delete a package. Lineups themselves are not affected."""
    deleted = await lineup_package_service.delete(db, package_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Package not found")
    await db.commit()


@router.post("/lineup-packages/{package_id}/pin", response_model=PinAllResponse)
async def pin_all_lineup_package(
    package_id: uuid.UUID,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> PinAllResponse:
    """Return lineup_ids for client-side pin-all.

    Pins live in localStorage (``usePins`` hook). This endpoint returns the
    ordered lineup_ids so the frontend can iterate and pin each. No server
    state is modified.
    """
    result = await lineup_package_service.get_pin_all(db, package_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return result
