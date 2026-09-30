"""User-row data access used by auth flows.

Mirrors apps/myjobhunter/backend/app/repositories/user/user_repo.py.
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
    return await _shared_get_by_id(db, user_id, user_model=User)


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    return await _shared_get_by_email(db, email, user_model=User)


async def get_totp_enabled(db: AsyncSession, email: str) -> bool:
    return await _shared_get_totp_enabled(db, email, user_model=User)
