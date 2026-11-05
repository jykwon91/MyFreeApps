"""The answer a signed-in request gets when its account is locked."""
import uuid
from typing import NoReturn

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from platform_shared.services.account_lockout import emit_locked_login_event


async def refuse_as_locked(db: AsyncSession, user_id: uuid.UUID, request: Request) -> NoReturn:
    """Record the attempt and raise the same 429 every rate limit and lockout gives."""
    await emit_locked_login_event(db=db, user_id=user_id, request=request)
    await db.commit()
    raise HTTPException(status_code=429, detail=RATE_LIMIT_GENERIC_DETAIL)
