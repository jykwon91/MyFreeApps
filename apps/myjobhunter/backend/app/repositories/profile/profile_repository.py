"""Profile repository — Phase 1 stub."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile.profile import Profile


async def get_by_id(db: AsyncSession, profile_id: uuid.UUID, user_id: uuid.UUID) -> Profile | None:
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_by_user_id(db: AsyncSession, user_id: uuid.UUID) -> Profile | None:
    result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Profile]:
    result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    return list(result.scalars().all())
