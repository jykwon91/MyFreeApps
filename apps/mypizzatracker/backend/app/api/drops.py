"""Drop + Slot management routes -- operator only.

Single-user app: the operator owns the entire surface. Auth is enforced at
the router level so new handlers cannot accidentally regress to "no auth".

Routes are registered without the ``/api`` prefix -- docker Caddy strips
``/api`` before forwarding to the backend, and ``root_path="/api"`` on the
FastAPI app records the stripped prefix for URL generation. Match
MJH/MBK pattern, not MGA's mistaken ``prefix="/api"`` shape.

Endpoints (paths registered here; production URLs prepend ``/api``):
  POST   /drops                        -- create a planning drop
  GET    /drops                        -- list drops (optionally filtered by status)
  GET    /drops/{drop_id}              -- drop detail (includes slots)
  PATCH  /drops/{drop_id}              -- update fields / transition status
  DELETE /drops/{drop_id}              -- delete (only when status='planning')

  POST   /drops/{drop_id}/slots             -- add a slot
  PATCH  /drops/{drop_id}/slots/{slot_id}   -- update a slot
  DELETE /drops/{drop_id}/slots/{slot_id}   -- remove a slot
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.schemas.drop.drop_schemas import (
    DropCreate,
    DropRead,
    DropUpdate,
    SlotCreate,
    SlotRead,
    SlotUpdate,
)
from app.services.drop import drop_service
from app.services.drop.drop_service import DropServiceError, SlotNotFoundError

router = APIRouter(
    prefix="/drops",
    tags=["drops"],
    dependencies=[Depends(current_active_user)],
)


def _service_error(exc: DropServiceError) -> HTTPException:
    return HTTPException(status_code=exc.http_status, detail=str(exc))


@router.post("", response_model=DropRead, status_code=201)
async def create_drop(
    body: DropCreate,
    db: AsyncSession = Depends(get_db),
) -> DropRead:
    drop = await drop_service.create_drop(db, body)
    return DropRead.model_validate(drop)


@router.get("", response_model=list[DropRead])
async def list_drops(
    status: Optional[str] = Query(None, description="planning | active | closed"),
    db: AsyncSession = Depends(get_db),
) -> list[DropRead]:
    try:
        drops = await drop_service.list_drops(db, status=status)
    except DropServiceError as exc:
        raise _service_error(exc) from exc
    return [DropRead.model_validate(d) for d in drops]


@router.get("/{drop_id}", response_model=DropRead)
async def get_drop(
    drop_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> DropRead:
    try:
        drop = await drop_service.get_drop_or_404(db, drop_id)
    except DropServiceError as exc:
        raise _service_error(exc) from exc
    return DropRead.model_validate(drop)


@router.patch("/{drop_id}", response_model=DropRead)
async def update_drop(
    drop_id: uuid.UUID,
    body: DropUpdate,
    db: AsyncSession = Depends(get_db),
) -> DropRead:
    try:
        drop = await drop_service.get_drop_or_404(db, drop_id)
        drop = await drop_service.update_drop(db, drop, body)
    except DropServiceError as exc:
        raise _service_error(exc) from exc
    return DropRead.model_validate(drop)


@router.delete("/{drop_id}", status_code=204)
async def delete_drop(
    drop_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        drop = await drop_service.get_drop_or_404(db, drop_id)
        await drop_service.delete_drop(db, drop)
    except DropServiceError as exc:
        raise _service_error(exc) from exc


# ---------------------------------------------------------------------------
# Nested slot routes
# ---------------------------------------------------------------------------

@router.post("/{drop_id}/slots", response_model=SlotRead, status_code=201)
async def add_slot(
    drop_id: uuid.UUID,
    body: SlotCreate,
    db: AsyncSession = Depends(get_db),
) -> SlotRead:
    try:
        drop = await drop_service.get_drop_or_404(db, drop_id)
        slot = await drop_service.add_slot(db, drop, body)
    except DropServiceError as exc:
        raise _service_error(exc) from exc
    return SlotRead.model_validate(slot)


@router.patch("/{drop_id}/slots/{slot_id}", response_model=SlotRead)
async def update_slot(
    drop_id: uuid.UUID,
    slot_id: uuid.UUID,
    body: SlotUpdate,
    db: AsyncSession = Depends(get_db),
) -> SlotRead:
    try:
        drop = await drop_service.get_drop_or_404(db, drop_id)
        slot = await drop_service.get_slot_or_404(db, slot_id)
        if slot.drop_id != drop.id:
            raise SlotNotFoundError(f"Slot {slot_id} not under drop {drop_id}")
        slot = await drop_service.update_slot(db, drop, slot, body)
    except DropServiceError as exc:
        raise _service_error(exc) from exc
    return SlotRead.model_validate(slot)


@router.delete("/{drop_id}/slots/{slot_id}", status_code=204)
async def delete_slot(
    drop_id: uuid.UUID,
    slot_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        drop = await drop_service.get_drop_or_404(db, drop_id)
        slot = await drop_service.get_slot_or_404(db, slot_id)
        if slot.drop_id != drop.id:
            raise SlotNotFoundError(f"Slot {slot_id} not under drop {drop_id}")
        await drop_service.remove_slot(db, drop, slot)
    except DropServiceError as exc:
        raise _service_error(exc) from exc
