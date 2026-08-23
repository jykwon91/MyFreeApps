"""Welcome-manual places routes — the flat guest dining directory.

Split out of ``welcome_manuals.py`` (which sits above the 500-LOC growth
guard). Same ``/welcome-manuals`` prefix and tag, so the public API shape is
unchanged; only the module boundary moved.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.schemas.welcome_manuals.welcome_manual_place_create_request import (
    WelcomeManualPlaceCreateRequest,
)
from app.schemas.welcome_manuals.welcome_manual_place_response import (
    WelcomeManualPlaceResponse,
)
from app.schemas.welcome_manuals.welcome_manual_place_update_request import (
    WelcomeManualPlaceUpdateRequest,
)
from app.services.welcome_manuals import welcome_manual_place_service

router = APIRouter(prefix="/welcome-manuals", tags=["welcome-manuals"])


@router.post(
    "/{manual_id}/places",
    response_model=WelcomeManualPlaceResponse,
    status_code=201,
)
async def add_place(
    manual_id: uuid.UUID,
    payload: WelcomeManualPlaceCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> WelcomeManualPlaceResponse:
    try:
        return await welcome_manual_place_service.add_place(
            ctx.organization_id, ctx.user_id, manual_id,
            payload.name, payload.cuisine, payload.price_tier, payload.note, payload.map_url,
        )
    except welcome_manual_place_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_place_service.TooManyPlacesError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch(
    "/{manual_id}/places/{place_id}",
    response_model=WelcomeManualPlaceResponse,
)
async def update_place(
    manual_id: uuid.UUID,
    place_id: uuid.UUID,
    payload: WelcomeManualPlaceUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> WelcomeManualPlaceResponse:
    try:
        return await welcome_manual_place_service.update_place(
            ctx.organization_id, ctx.user_id, manual_id, place_id,
            payload.to_update_dict(),
        )
    except welcome_manual_place_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_place_service.PlaceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Place not found") from exc


@router.delete(
    "/{manual_id}/places/{place_id}",
    status_code=204,
)
async def delete_place(
    manual_id: uuid.UUID,
    place_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await welcome_manual_place_service.delete_place(
            ctx.organization_id, ctx.user_id, manual_id, place_id,
        )
    except welcome_manual_place_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_place_service.PlaceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Place not found") from exc
    return Response(status_code=204)
