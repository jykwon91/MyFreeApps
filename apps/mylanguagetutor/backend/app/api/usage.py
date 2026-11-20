"""GET /usage/today -- the caller's remaining daily tutor budget.

The UI checks it BEFORE recording so a learner at their cap never talks into
a request that will be refused. ``session_id`` sizes the check for that
conversation's next turn (404 ``session_not_found`` if it isn't the caller's).
Auth at the ROUTER level.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.tutor.turn_schemas import UsageTodayResponse
from app.services.tutor import usage_service
from app.services.tutor.turn_errors import SessionNotFoundError

router = APIRouter(
    prefix="/usage",
    tags=["usage"],
    dependencies=[Depends(current_active_user)],
)


@router.get("/today", response_model=UsageTodayResponse)
async def usage_today(
    session_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> UsageTodayResponse:
    try:
        return await usage_service.usage_today(db, user.id, session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=exc.code) from exc
