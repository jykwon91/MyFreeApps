"""User row lookups used by auth route dependencies.

Kept as a thin repository so :mod:`app.core.rate_limit`'s
``check_account_not_locked`` can read ``locked_until`` without importing
ORM primitives directly into a route-dependency module.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.user import User


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()
