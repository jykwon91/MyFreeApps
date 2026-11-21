"""GET /usage/today -- the learner's own remaining daily budget.

Only per-user numbers leave the server; the global budget is reduced to a
boolean ``tutor_available`` (kill switch / no API key), never a number.
``cap_reached`` is sized for the learner's next turn: in the conversation they
are in when a session id is given (its history makes turns dearer), else a
first turn -- the same estimate the turn itself reserves. ``session_limit_reached`` says the
conversation is out of turns, so the UI can say so before the learner speaks.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.tutor import tutor_session_repository
from app.schemas.tutor.turn_schemas import UsageTodayResponse
from app.services.tutor import quota_service, session_limits, turn_estimate
from app.services.tutor.turn_errors import SessionNotFoundError


async def usage_today(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID | None = None,
) -> UsageTodayResponse:
    """Raises ``SessionNotFoundError`` for a missing or another user's session."""
    session_limit_reached = False
    if session_id is None:
        units = turn_estimate.first_turn_units()
    else:
        session = await tutor_session_repository.get_by_id(db, session_id, user_id)
        if session is None:
            raise SessionNotFoundError("session not found")
        units = await turn_estimate.session_next_turn_units(db, session)
        session_limit_reached = session_limits.turn_limit_reached(session)
    remaining = await quota_service.remaining_fraction(db, user_id)
    affordable = await quota_service.can_afford(db, user_id, units=units)
    return UsageTodayResponse(
        remaining_fraction=round(remaining, 3),
        cap_reached=not affordable,
        tutor_available=quota_service.tutor_enabled(),
        session_limit_reached=session_limit_reached,
    )
