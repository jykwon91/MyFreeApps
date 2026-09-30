"""GET /usage/today -- the caller's remaining daily tutor budget.

The UI checks it BEFORE recording so a learner at their cap never talks into
a request that will be refused. Auth at the ROUTER level.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.tutor.turn_schemas import UsageTodayResponse
from app.services.tutor import usage_service

router = APIRouter(
    prefix="/usage",
    tags=["usage"],
    dependencies=[Depends(current_active_user)],
)


@router.get("/today", response_model=UsageTodayResponse)
async def usage_today(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> UsageTodayResponse:
    return await usage_service.usage_today(db, user.id)
