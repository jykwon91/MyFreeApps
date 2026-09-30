"""Tutor session lifecycle: start, list, read (with turns), end, delete.

Services load via repositories, decide, persist, and commit; mappers convert
ORM -> response. Every operation takes the caller's ``user_id`` and threads it
into the repository, so another user's session is simply "not found" (404 at
the route) -- no existence leak.

Never log transcript text (learner/reply/corrections/translation).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.languages import get_language
from app.domain.scenarios import get_scenario
from app.domain.session_status import SessionStatus
from app.models.tutor.tutor_session import TutorSession
from app.repositories.tutor import tutor_session_repository, tutor_turn_repository
from app.schemas.tutor.session_schemas import (
    SessionCreateRequest,
    SessionDetailResponse,
    SessionListResponse,
    SessionSummary,
)
from app.services.tutor.tutor_mappers import to_session_detail, to_session_summary


class InvalidSessionRequestError(ValueError):
    """Raised when a create request names an unknown language or scenario."""


async def create_session(
    db: AsyncSession, user_id: uuid.UUID, payload: SessionCreateRequest,
) -> SessionSummary:
    if get_language(payload.language_code) is None:
        raise InvalidSessionRequestError(f"Unsupported language: {payload.language_code}")
    if get_scenario(payload.scenario_slug) is None:
        raise InvalidSessionRequestError(f"Unknown scenario: {payload.scenario_slug}")

    session = await tutor_session_repository.create(
        db,
        TutorSession(
            user_id=user_id,
            language_code=payload.language_code,
            scenario_slug=payload.scenario_slug,
            level=payload.level.value,
            status=SessionStatus.ACTIVE.value,
        ),
    )
    summary = to_session_summary(session)
    await db.commit()
    return summary


async def list_sessions(
    db: AsyncSession, user_id: uuid.UUID, *, limit: int, offset: int,
) -> SessionListResponse:
    sessions = await tutor_session_repository.list_by_user(
        db, user_id, limit=limit, offset=offset,
    )
    total = await tutor_session_repository.count_by_user(db, user_id)
    return SessionListResponse(
        items=[to_session_summary(s) for s in sessions],
        total=total,
        limit=limit,
        offset=offset,
    )


async def get_session(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID,
) -> SessionDetailResponse | None:
    session = await tutor_session_repository.get_by_id(db, session_id, user_id)
    if session is None:
        return None
    turns = await tutor_turn_repository.list_by_session(db, session_id, user_id)
    return to_session_detail(session, turns)


async def end_session(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID,
) -> SessionSummary | None:
    """Mark a session ended. Idempotent: ending an ended session keeps the
    original ``ended_at``."""
    session = await tutor_session_repository.get_by_id(db, session_id, user_id)
    if session is None:
        return None
    if session.status != SessionStatus.ENDED.value:
        session.status = SessionStatus.ENDED.value
        session.ended_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(session)
    summary = to_session_summary(session)
    await db.commit()
    return summary


async def delete_session(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID,
) -> bool:
    """Hard-delete a session and (via FK cascade) its turns. False if not found."""
    session = await tutor_session_repository.get_by_id(db, session_id, user_id)
    if session is None:
        return False
    await tutor_session_repository.delete(db, session)
    await db.commit()
    return True
