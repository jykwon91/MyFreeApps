"""User-row data access used by TOTP and auth flows.

The three canonical lookups (by id, by email, totp-enabled probe) are
shared via ``platform_shared.repositories.user_repo``; this module thin-
wraps them and binds MJH's ``User`` class. Kept as bare functions (no
class) to match the rest of MJH's repository layer and to make patching
easy in tests.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories.user_repo import (
    get_by_email as _shared_get_by_email,
    get_by_id as _shared_get_by_id,
    get_totp_enabled as _shared_get_totp_enabled,
)

from app.models.user.user import User


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Return the user with ``user_id``, or ``None`` if not found."""
    return await _shared_get_by_id(db, user_id, user_model=User)


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    """Return the user with ``email``, or ``None`` if not found."""
    return await _shared_get_by_email(db, email, user_model=User)


async def get_totp_enabled(db: AsyncSession, email: str) -> bool:
    """Cheap probe — does the user with ``email`` have 2FA enabled?

    Returns ``False`` for unknown emails so callers don't have to distinguish
    "no such user" from "user without 2FA". The login flow uses this to
    decide whether to surface ``detail: totp_required``.
    """
    return await _shared_get_totp_enabled(db, email, user_model=User)
