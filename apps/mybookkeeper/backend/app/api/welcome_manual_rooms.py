"""Welcome-manual room routes.

Rooms let one manual serve several lettable rooms of the same property: the
shared sections are written once, and a section tagged with a room reaches only
that room's guest. Sections are scoped via ``room_id`` on the section routes in
``welcome_manuals.py``; these routes manage the rooms themselves.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.welcome_manuals.welcome_manual_room_create_request import (
    WelcomeManualRoomCreateRequest,
)
from app.schemas.welcome_manuals.welcome_manual_room_reorder_request import (
    WelcomeManualRoomReorderRequest,
)
from app.schemas.welcome_manuals.welcome_manual_room_response import (
    WelcomeManualRoomResponse,
)
from app.schemas.welcome_manuals.welcome_manual_room_update_request import (
    WelcomeManualRoomUpdateRequest,
)
from app.services.welcome_manuals import welcome_manual_room_service

router = APIRouter(prefix="/welcome-manuals", tags=["welcome-manuals"])


@router.get("/{manual_id}/rooms", response_model=list[WelcomeManualRoomResponse])
async def list_rooms(
    manual_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> list[WelcomeManualRoomResponse]:
    try:
        return await welcome_manual_room_service.list_rooms(
            ctx.organization_id, ctx.user_id, manual_id,
        )
    except welcome_manual_room_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc


@router.post(
    "/{manual_id}/rooms",
    response_model=WelcomeManualRoomResponse,
    status_code=201,
)
async def add_room(
    manual_id: uuid.UUID,
    payload: WelcomeManualRoomCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> WelcomeManualRoomResponse:
    try:
        return await welcome_manual_room_service.add_room(
            ctx.organization_id, ctx.user_id, manual_id, name=payload.name,
        )
    except welcome_manual_room_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_room_service.TooManyRoomsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.put(
    "/{manual_id}/rooms/order",
    response_model=list[WelcomeManualRoomResponse],
)
async def reorder_rooms(
    manual_id: uuid.UUID,
    payload: WelcomeManualRoomReorderRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> list[WelcomeManualRoomResponse]:
    try:
        return await welcome_manual_room_service.reorder_rooms(
            ctx.organization_id, ctx.user_id, manual_id, payload.room_ids,
        )
    except welcome_manual_room_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_room_service.InvalidRoomReorderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch(
    "/{manual_id}/rooms/{room_id}",
    response_model=WelcomeManualRoomResponse,
)
async def update_room(
    manual_id: uuid.UUID,
    room_id: uuid.UUID,
    payload: WelcomeManualRoomUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> WelcomeManualRoomResponse:
    try:
        return await welcome_manual_room_service.update_room(
            ctx.organization_id, ctx.user_id, manual_id, room_id,
            payload.to_update_dict(),
        )
    except welcome_manual_room_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_room_service.RoomNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Room not found") from exc


@router.delete("/{manual_id}/rooms/{room_id}", status_code=204)
async def delete_room(
    manual_id: uuid.UUID,
    room_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    """Delete a room. Sections scoped to it go too; shared sections stay."""
    try:
        await welcome_manual_room_service.delete_room(
            ctx.organization_id, ctx.user_id, manual_id, room_id,
        )
    except welcome_manual_room_service.ManualNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Welcome manual not found") from exc
    except welcome_manual_room_service.RoomNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Room not found") from exc
    return Response(status_code=204)
