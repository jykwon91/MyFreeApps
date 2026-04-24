"""Profile service — Phase 1 stub.

Orchestrates profile + work_history + education + skill + screening_answer.
Full CRUD implemented in Phase 2.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile.profile import Profile
from app.repositories.profile import profile_repository


async def get_profile(db: AsyncSession, user_id: uuid.UUID) -> Profile | None:
    return await profile_repository.get_by_user_id(db, user_id)
