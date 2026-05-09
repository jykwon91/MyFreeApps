"""User-row reads parameterized on the per-app User model.

Each app's own ``User`` class differs in domain columns (MBK has
``role``/``name``, MJH has ``display_name``/``is_demo``), but the three
canonical lookups — by id, by email, totp-status — share the same shape
across every app. Apps thin-wrap these and bind their own User class.

Usage in ``apps/<app>/backend/app/repositories/user/user_repo.py``:

    from platform_shared.repositories.user_repo import (
        get_by_id as _shared_get_by_id,
        get_by_email as _shared_get_by_email,
        get_totp_enabled as _shared_get_totp_enabled,
    )
    from app.models.user.user import User

    async def get_by_id(db, user_id):
        return await _shared_get_by_id(db, user_id, user_model=User)

    # ... same for get_by_email and get_totp_enabled
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def get_by_id(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    user_model: Any,
) -> Any | None:
    """Return the user row with ``user_id``, or ``None`` if not found."""
    result = await db.execute(select(user_model).where(user_model.id == user_id))
    return result.scalar_one_or_none()


async def get_by_email(
    db: AsyncSession,
    email: str,
    *,
    user_model: Any,
) -> Any | None:
    """Return the user row with ``email``, or ``None`` if not found."""
    result = await db.execute(select(user_model).where(user_model.email == email))
    return result.scalar_one_or_none()


async def get_totp_enabled(
    db: AsyncSession,
    email: str,
    *,
    user_model: Any,
) -> bool:
    """Cheap probe — does the user with ``email`` have TOTP 2FA enabled?

    Returns ``False`` for unknown emails so callers don't have to
    distinguish "no such user" from "user without 2FA". The login flow
    uses this to decide whether to surface ``detail: totp_required``.
    """
    result = await db.execute(
        select(user_model.totp_enabled).where(user_model.email == email),
    )
    row = result.scalar_one_or_none()
    return bool(row)
