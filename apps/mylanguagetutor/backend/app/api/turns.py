"""POST /sessions/{id}/turns -- one conversation turn, streamed as SSE.

Everything that can refuse the turn runs in dependencies, BEFORE the stream
opens, so refusals are real HTTP statuses:

    429 (generic)            burst limiter (LTUTOR_TURNS_PER_MINUTE per user)
    429 turn_in_progress     this user already has a turn streaming, or a turn
                             in this session is still finishing (any worker)
    503 tutor_unavailable    kill switch / no API key / global budget spent
    404 session_not_found    missing or another user's session (no leak)
    409 session_ended        the session was ended
    409 session_turn_limit   LTUTOR_MAX_TURNS_PER_SESSION reached
    429 daily_limit_reached  the learner's daily budget can't cover a turn
    422                      empty / over-500-character text

Then the stream: turn.started, reply.delta*, reply.done, corrections, done --
or turn.started, [reply.delta*], error, done. See app/schemas/tutor/turn_schemas.py.
Auth (active + verified) is attached at the ROUTER level.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.core.auth import current_active_user
from app.core.rate_limit import check_user_rate_limit, turn_limiter
from app.models.user.user import User
from app.schemas.tutor.turn_schemas import TurnCreateRequest
from app.services.tutor import quota_service, turn_service
from app.services.tutor.prepared_turn import PreparedTurn
from app.services.tutor.turn_errors import (
    SessionEndedError,
    SessionNotFoundError,
    SessionTurnLimitError,
    TurnInProgressError,
)
from app.services.tutor.turn_slots import turn_slots

router = APIRouter(
    prefix="/sessions",
    tags=["turns"],
    dependencies=[Depends(current_active_user)],
)

TUTOR_UNAVAILABLE = "tutor_unavailable"
DAILY_LIMIT_REACHED = "daily_limit_reached"


async def _turn_slot(user: User = Depends(current_active_user)) -> AsyncIterator[None]:
    """Burst limit + one turn in flight per user, held for the whole request
    (the yield-dependency teardown runs after the stream finishes)."""
    check_user_rate_limit(user.id, turn_limiter)
    if not turn_slots.try_acquire(user.id):
        raise HTTPException(status_code=429, detail=TurnInProgressError.code)
    try:
        yield
    finally:
        turn_slots.release(user.id)


async def _prepared_turn(
    session_id: uuid.UUID,
    payload: TurnCreateRequest,
    user: User = Depends(current_active_user),
    _slot: None = Depends(_turn_slot),
) -> PreparedTurn:
    if not quota_service.tutor_enabled():
        raise HTTPException(status_code=503, detail=TUTOR_UNAVAILABLE)
    try:
        return await turn_service.prepare_turn(
            user_id=user.id, session_id=session_id, text=payload.text,
        )
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=exc.code) from exc
    except (SessionEndedError, SessionTurnLimitError) as exc:
        raise HTTPException(status_code=409, detail=exc.code) from exc
    except TurnInProgressError as exc:
        raise HTTPException(status_code=429, detail=exc.code) from exc
    except quota_service.DailyLimitReachedError as exc:
        raise HTTPException(status_code=429, detail=DAILY_LIMIT_REACHED) from exc
    except quota_service.TutorUnavailableError as exc:
        raise HTTPException(status_code=503, detail=TUTOR_UNAVAILABLE) from exc


async def _turn_events(
    prepared: PreparedTurn = Depends(_prepared_turn),
) -> AsyncIterator[AsyncGenerator[turn_service.TurnEvent, None]]:
    """The turn's event stream, closed in this dependency's teardown -- after the
    response ends, while the turn slot is still held. FastAPI never closes the
    route's generator: a disconnect cancels it mid-await, which runs the stream's
    ``finally``, but one left waiting at a ``yield`` would only be closed later by
    garbage collection, outside the request."""
    events = turn_service.stream_turn(prepared)
    try:
        yield events
    finally:
        await events.aclose()


@router.post("/{session_id}/turns", response_class=EventSourceResponse)
async def create_turn(
    events: AsyncGenerator[turn_service.TurnEvent, None] = Depends(_turn_events),
) -> AsyncIterator[ServerSentEvent]:
    async for event in events:
        yield ServerSentEvent(event=event.name, data=event.payload)
