"""Profile repository — owns every query against the profiles table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. The profile is 1:1 with users,
so there is no POST/DELETE — the profile row is created lazily on first
GET and updated via PATCH.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile.profile import Profile

_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "work_auth_status",
    "desired_salary_min",
    "desired_salary_max",
    "salary_currency",
    "salary_period",
    "locations",
    "remote_preference",
    "seniority",
    "summary",
    "timezone",
})


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


async def create(db: AsyncSession, profile: Profile) -> Profile:
    """Persist a new Profile row (called by service on first access)."""
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile


async def update(
    db: AsyncSession,
    profile: Profile,
    updates: dict[str, Any],
) -> Profile:
    """Apply allowlisted updates to a Profile."""
    safe_fields = {k: v for k, v in updates.items() if k in _UPDATABLE_COLUMNS}
    for key, value in safe_fields.items():
        setattr(profile, key, value)
    await db.flush()
    await db.refresh(profile)
    return profile
