"""Repository for ``skills`` — owns every query against the table.

The UNIQUE constraint is on (user_id, lower(name)). IntegrityError on INSERT
is caught at the service layer and raised as ``DuplicateSkillError``, except
in ``add_if_absent``, which skips a skill the user already has.
"""
from __future__ import annotations

import uuid

from platform_shared.repositories.audited_writes import insert_if_absent
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile.skill import Skill


async def get_by_id(
    db: AsyncSession, skill_id: uuid.UUID, user_id: uuid.UUID,
) -> Skill | None:
    result = await db.execute(
        select(Skill).where(Skill.id == skill_id, Skill.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Skill]:
    result = await db.execute(
        select(Skill)
        .where(Skill.user_id == user_id)
        .order_by(Skill.name.asc())
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, skill: Skill) -> Skill:
    db.add(skill)
    await db.flush()
    await db.refresh(skill)
    return skill


async def delete(db: AsyncSession, skill: Skill) -> None:
    await db.delete(skill)
    await db.flush()


async def add_if_absent(db: AsyncSession, skill: Skill) -> bool:
    """Insert ``skill`` unless the user already has one of that name, in any case.

    ``skill`` is a transient row carrying the values; a copy is inserted.
    Returns True when a row was inserted, False when the skill already existed.
    """
    inserted = await insert_if_absent(
        db, Skill,
        Skill.user_id == skill.user_id,
        func.lower(Skill.name) == func.lower(skill.name),
        create={
            "user_id": skill.user_id,
            "profile_id": skill.profile_id,
            "name": skill.name,
            "category": skill.category,
            "years_experience": skill.years_experience,
        },
    )
    return inserted is not None
