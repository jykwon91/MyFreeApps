import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

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
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_totp_enabled(db: AsyncSession, email: str) -> bool:
    result = await db.execute(select(User.totp_enabled).where(User.email == email))
    row = result.scalar_one_or_none()
    return bool(row)


async def update_role(db: AsyncSession, user: User, role: Role) -> User:
    user.role = role
    return user


async def set_active(db: AsyncSession, user: User, *, is_active: bool) -> User:
    user.is_active = is_active
    return user
