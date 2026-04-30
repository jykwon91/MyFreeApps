"""User-row data access used by TOTP and auth flows.

Kept as bare functions (no class) to match the rest of MJH's repository
layer and to make patching easy in tests. ``check_account_not_locked``
(in :mod:`app.core.rate_limit`) reads the user row through here so that
route-dependency module doesn't import ORM primitives directly.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.user import User


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Return the user with ``user_id``, or ``None`` if not found."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    """Return the user with ``email``, or ``None`` if not found."""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_totp_enabled(db: AsyncSession, email: str) -> bool:
    """Cheap probe — does the user with ``email`` have 2FA enabled?

    Returns ``False`` for unknown emails so callers don't have to distinguish
    "no such user" from "user without 2FA". The login flow uses this to
    decide whether to surface ``detail: totp_required``.
    """
    result = await db.execute(
        select(User.totp_enabled).where(User.email == email),
    )
    row = result.scalar_one_or_none()
    return bool(row)
