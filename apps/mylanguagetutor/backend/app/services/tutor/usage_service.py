"""GET /usage/today -- the learner's own remaining daily budget.

Only per-user numbers leave the server; the global budget is reduced to a
boolean ``tutor_available`` (kill switch / no API key), never a number.
``cap_reached`` is sized for the learner's next turn: in the conversation they
are in when a session id is given (its history makes turns dearer), else a
first turn -- the same estimate the turn itself reserves.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.tutor.turn_schemas import UsageTodayResponse
from app.services.tutor import quota_service, turn_estimate


async def usage_today(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID | None = None,
) -> UsageTodayResponse:
    """Raises ``SessionNotFoundError`` for a missing or another user's session."""
    units = (
        await turn_estimate.next_turn_units(db, user_id, session_id)
        if session_id is not None
        else turn_estimate.first_turn_units()
    )
    remaining = await quota_service.remaining_fraction(db, user_id)
    affordable = await quota_service.can_afford(db, user_id, units=units)
    return UsageTodayResponse(
        remaining_fraction=round(remaining, 3),
        cap_reached=not affordable,
        tutor_available=quota_service.tutor_enabled(),
    )
