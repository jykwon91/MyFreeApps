"""GET /usage/today -- the learner's own remaining daily budget.

Only per-user numbers leave the server; the global budget is reduced to a
boolean ``tutor_available`` (kill switch / no API key), never a number.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.tutor.turn_schemas import UsageTodayResponse
from app.services.tutor import quota_service
from app.services.tutor.turn_service import minimum_turn_units


async def usage_today(db: AsyncSession, user_id: uuid.UUID) -> UsageTodayResponse:
    remaining = await quota_service.remaining_fraction(db, user_id)
    affordable = await quota_service.can_afford(db, user_id, units=minimum_turn_units())
    return UsageTodayResponse(
        remaining_fraction=round(remaining, 3),
        cap_reached=not affordable,
        tutor_available=quota_service.tutor_enabled(),
    )
