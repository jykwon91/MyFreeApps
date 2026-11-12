"""User-row data access used by TOTP and auth flows.

The three canonical lookups (by id, by email, totp-enabled probe) are
shared via ``platform_shared.repositories.user_repo``; this module thin-
wraps them and binds MJH's ``User`` class. Kept as bare functions (no
class) to match the rest of MJH's repository layer and to make patching
easy in tests.
"""
import uuid
from typing import Literal

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories.user_repo import (
    get_by_email as _shared_get_by_email,
    get_by_email_ci as _shared_get_by_email_ci,
    get_by_id as _shared_get_by_id,
)

from app.models.user.user import User


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Return the user with ``user_id``, or ``None`` if not found."""
    return await _shared_get_by_id(db, user_id, user_model=User)


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    """Return the user with ``email``, or ``None`` if not found."""
    return await _shared_get_by_email(db, email, user_model=User)


async def get_by_email_ci(db: AsyncSession, email: str) -> User | None:
    return await _shared_get_by_email_ci(db, email, user_model=User)


async def set_flag_by_email(
    db: AsyncSession,
    email: str,
    flag: Literal["is_verified", "is_superuser"],
) -> bool:
    """Set a boolean user flag TRUE by email. Returns False when no user matches."""
    result = await db.execute(
        update(User).where(User.email == email).values(**{flag: True}).returning(User.id)
    )
    return result.first() is not None
