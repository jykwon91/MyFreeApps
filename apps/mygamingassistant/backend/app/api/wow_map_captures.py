"""WoW Forever World Map captures — locations recorded in game by the MGA
Companion addon.

Two routers per MGA's public-read / auth-write model:

    ``public_router`` (both modes, serve-only prod included):
        GET  /api/wow/map-captures        — every capture; the map lays them
                                            over the Classic rows

    ``auth_router`` (operator only, full-auth mode):
        POST /api/wow/map-captures        — import the addon's records (parsed
                                            and classified in the browser)

Production is serve-only, so captures reach it through the committed pack
(``python -m app.cli export-wow-captures`` locally, ``import-wow-captures`` on
deploy). See ``app/services/wow/map_capture_service.py``.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.schemas.wow.map_capture import (
    MapCaptureImportRequest,
    MapCaptureImportResult,
    MapCaptureList,
)
from app.services.wow import map_capture_service

public_router = APIRouter(tags=["wow"])

auth_router = APIRouter(
    tags=["wow"],
    dependencies=[Depends(current_active_user)],
)


@public_router.get("/wow/map-captures", response_model=MapCaptureList)
async def list_map_captures(db: AsyncSession = Depends(get_db)) -> MapCaptureList:
    """Every World Map capture. Public."""
    return await map_capture_service.list_captures(db)


@auth_router.post("/wow/map-captures", response_model=MapCaptureImportResult)
async def import_map_captures(payload: MapCaptureImportRequest) -> MapCaptureImportResult:
    """Import captures from the addon's SavedVariables. Operator only.

    Re-importing is safe: records are matched by ``capture_key`` and only a
    later capture replaces a stored one.
    """
    return await map_capture_service.import_captures(payload)
