"""Tutor session routes.

    POST   /sessions              start a session -> 201
    GET    /sessions              the caller's sessions, newest first (paginated)
    GET    /sessions/{id}         one session with its turns (ordered by seq)
    POST   /sessions/{id}/end     mark ended (idempotent)
    DELETE /sessions/{id}         hard-delete session + turns -> 204

``Depends(current_active_user)`` (active + verified) is attached at the ROUTER
level. Every service call threads ``user.id``; another user's session is a 404
(no existence leak). Turn creation (SSE streaming) lands in PR 4.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.tutor.session_schemas import (
    SessionCreateRequest,
    SessionDetailResponse,
    SessionListResponse,
    SessionSummary,
)
from app.services.tutor import session_service
from app.services.tutor.session_service import InvalidSessionRequestError

router = APIRouter(
    prefix="/sessions",
    tags=["sessions"],
    dependencies=[Depends(current_active_user)],
)

_SESSION_NOT_FOUND = "Session not found"
_DEFAULT_PAGE_SIZE = 20
_MAX_PAGE_SIZE = 100


@router.post("", response_model=SessionSummary, status_code=201)
async def create_session(
    payload: SessionCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SessionSummary:
    try:
        return await session_service.create_session(db, user.id, payload)
    except InvalidSessionRequestError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
    limit: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
) -> SessionListResponse:
    return await session_service.list_sessions(db, user.id, limit=limit, offset=offset)


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SessionDetailResponse:
    detail = await session_service.get_session(db, user.id, session_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=_SESSION_NOT_FOUND)
    return detail


@router.post("/{session_id}/end", response_model=SessionSummary)
async def end_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SessionSummary:
    summary = await session_service.end_session(db, user.id, session_id)
    if summary is None:
        raise HTTPException(status_code=404, detail=_SESSION_NOT_FOUND)
    return summary


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    deleted = await session_service.delete_session(db, user.id, session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_SESSION_NOT_FOUND)
    return Response(status_code=204)
