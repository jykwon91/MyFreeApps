import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from platform_shared.repositories.user_repo import (
    get_by_email as _shared_get_by_email,
    get_by_id as _shared_get_by_id,
    get_totp_enabled as _shared_get_totp_enabled,
)

from app.models.user.user import Role, User


async def list_all(db: AsyncSession) -> Sequence[User]:
    result = await db.execute(
        select(User)
        .options(load_only(
            User.id, User.email, User.name, User.role,
            User.is_active, User.is_superuser, User.is_verified,
        ))
        .order_by(User.email)
    )
    return result.scalars().all()


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await _shared_get_by_id(db, user_id, user_model=User)


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    return await _shared_get_by_email(db, email, user_model=User)


async def get_totp_enabled(db: AsyncSession, email: str) -> bool:
    return await _shared_get_totp_enabled(db, email, user_model=User)


async def update_role(db: AsyncSession, user: User, role: Role) -> User:
    user.role = role
    return user


async def set_active(db: AsyncSession, user: User, *, is_active: bool) -> User:
    user.is_active = is_active
    return user
