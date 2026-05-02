"""Repository for ``skills`` — owns every query against the table.

The UNIQUE constraint is on (user_id, lower(name)). IntegrityError on INSERT
is caught at the service layer and raised as ``DuplicateSkillError``.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
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
