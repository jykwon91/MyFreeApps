"""Repository for ``tutor_profile``. One row per user, keyed by ``user_id``."""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tutor.tutor_profile import TutorProfile


async def get(db: AsyncSession, user_id: uuid.UUID) -> TutorProfile | None:
    return await db.get(TutorProfile, user_id)


async def create(db: AsyncSession, profile: TutorProfile) -> TutorProfile:
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile
