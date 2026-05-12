"""MGA permission dependencies.

Single-user app — the operator is the sole superuser. Mirrors MJH's
permission module structure.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.permissions import (
    make_current_superuser,
    make_decode_token_iat,
    make_strict_superuser_gate,
)

from app.core.auth import current_active_user
from app.core.config import settings
from app.db.session import get_db
from app.services.user.totp_service import verify_totp_code as _verify_totp_code

current_superuser = make_current_superuser(current_active_user)

# Back-compat alias.
current_admin = current_superuser


async def _verify_totp_step_up(
    db: AsyncSession, user_id: uuid.UUID, code: str,
) -> None:
    if not await _verify_totp_code(db, user_id, code):
        raise HTTPException(status_code=403, detail="invalid_totp")


_decode_token_iat = make_decode_token_iat(secret_key=settings.secret_key)

# 60-min recent-auth window — mirrors MJH.
current_strict_superuser = make_strict_superuser_gate(
    current_active_user=current_active_user,
    get_db=get_db,
    verify_totp_step_up=_verify_totp_step_up,
    decode_token_iat=_decode_token_iat,
    max_token_age_seconds=3600,
)
