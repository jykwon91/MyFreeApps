"""Resume-refinement API.

Endpoints:

POST   /resume-refinement/sessions                          start a new session
GET    /resume-refinement/sessions                          list user's sessions
GET    /resume-refinement/sessions/{id}                     read session state
POST   /resume-refinement/sessions/{id}/accept              accept pending proposal
POST   /resume-refinement/sessions/{id}/custom              supply custom rewrite
POST   /resume-refinement/sessions/{id}/alternative         regenerate same target
POST   /resume-refinement/sessions/{id}/skip                skip current target
POST   /resume-refinement/sessions/{id}/complete            mark session done
GET    /resume-refinement/sessions/{id}/export?format=pdf|docx   download document

All routes require auth and are tenant-scoped on the session ``user_id``.
"""
from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.resume_refinement.session import (
    NavigateRequest,
    SessionRead,
    SessionStartRequest,
    TurnAlternativeRequest,
    TurnCustomRequest,
)
from app.services.resume_refinement import session_service
from app.services.resume_refinement.errors import (
    NoMoreTargets,
    NoPendingProposal,
    SessionNotActive,
    SessionNotFound,
    SourceJobNotFound,
    SourceJobNotReady,
    CritiqueRetryExceeded,
)
from app.services.resume_refinement.export_service import (
    ExportFidelityError,
    export_resume,
)

router = APIRouter(prefix="/resume-refinement", tags=["resume-refinement"])


@router.post("/sessions", response_model=SessionRead, status_code=201)
async def start_session(
    body: SessionStartRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SessionRead:
    """Start a new refinement session from a completed resume upload."""
    try:
        session = await session_service.start_session(
            db=db,
            user_id=user.id,
            source_resume_job_id=body.source_resume_job_id,
        )
    except SourceJobNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SourceJobNotReady as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except CritiqueRetryExceeded as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return SessionRead.model_validate(session)


@router.get("/sessions/{session_id}", response_model=SessionRead)
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SessionRead:
    try:
        session = await session_service.get_session_state(
            db=db, user_id=user.id, session_id=session_id,
        )
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    return SessionRead.model_validate(session)


@router.post("/sessions/{session_id}/accept", response_model=SessionRead)
async def accept_pending(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SessionRead:
    try:
        session = await session_service.accept_pending(
            db=db, user_id=user.id, session_id=session_id,
        )
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except SessionNotActive as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except NoPendingProposal as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return SessionRead.model_validate(session)


@router.post("/sessions/{session_id}/custom", response_model=SessionRead)
async def supply_custom(
    session_id: uuid.UUID,
    body: TurnCustomRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SessionRead:
    try:
        session = await session_service.accept_custom(
            db=db,
            user_id=user.id,
            session_id=session_id,
            user_text=body.user_text,
        )
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except SessionNotActive as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except NoMoreTargets as exc:
        raise HTTPException(status_code=409, detail="No remaining targets to rewrite") from exc
    return SessionRead.model_validate(session)


@router.post("/sessions/{session_id}/alternative", response_model=SessionRead)
async def request_alternative(
    session_id: uuid.UUID,
    body: TurnAlternativeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SessionRead:
    try:
        session = await session_service.request_alternative(
            db=db,
            user_id=user.id,
            session_id=session_id,
            hint=body.hint,
        )
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except SessionNotActive as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except NoMoreTargets as exc:
        raise HTTPException(status_code=409, detail="No remaining targets to rewrite") from exc
    return SessionRead.model_validate(session)


@router.post("/sessions/{session_id}/skip", response_model=SessionRead)
async def skip_target(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SessionRead:
    try:
        session = await session_service.skip_target(
            db=db, user_id=user.id, session_id=session_id,
        )
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except SessionNotActive as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return SessionRead.model_validate(session)


@router.post("/sessions/{session_id}/navigate", response_model=SessionRead)
async def navigate(
    session_id: uuid.UUID,
    body: NavigateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SessionRead:
    """Browse suggestions without acting on them.

    Moves ``target_index`` forward or backward and regenerates the
    pending AI proposal for the new target. The current_draft is
    untouched. 400 when the move would step out of bounds.
    """
    try:
        session = await session_service.navigate(
            db=db,
            user_id=user.id,
            session_id=session_id,
            direction=body.direction,
        )
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except SessionNotActive as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except NoMoreTargets as exc:
        raise HTTPException(status_code=409, detail="No improvement targets to navigate") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SessionRead.model_validate(session)


@router.post("/sessions/{session_id}/complete", response_model=SessionRead)
async def complete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> SessionRead:
    try:
        session = await session_service.complete_session(
            db=db, user_id=user.id, session_id=session_id,
        )
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except SessionNotActive as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return SessionRead.model_validate(session)


@router.get("/sessions/{session_id}/export")
async def export_session(
    session_id: uuid.UUID,
    fmt: Literal["pdf", "docx"] = Query(..., alias="format"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    """Render the current draft to PDF or DOCX and return it as a download."""
    try:
        session = await session_service.get_session_state(
            db=db, user_id=user.id, session_id=session_id,
        )
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc

    draft = session.current_draft or ""
    if not draft.strip():
        raise HTTPException(status_code=409, detail="Session draft is empty")

    try:
        data = await export_resume(draft, fmt)
    except ExportFidelityError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"export_fidelity_check_failed: {exc.missing_facts[:5]}",
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    media_type = (
        "application/pdf"
        if fmt == "pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    filename = f"resume.{fmt}"
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
