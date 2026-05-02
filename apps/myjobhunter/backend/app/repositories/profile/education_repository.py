"""Repository for ``education`` — owns every query against the table."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile.education import Education

_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "school",
    "degree",
    "field",
    "start_year",
    "end_year",
    "gpa",
})


async def get_by_id(
    db: AsyncSession, education_id: uuid.UUID, user_id: uuid.UUID,
) -> Education | None:
    result = await db.execute(
        select(Education).where(
            Education.id == education_id,
            Education.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Education]:
    result = await db.execute(
        select(Education)
        .where(Education.user_id == user_id)
        .order_by(Education.end_year.desc().nullslast(), Education.start_year.desc().nullslast())
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, entry: Education) -> Education:
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


async def update(
    db: AsyncSession,
    entry: Education,
    updates: dict[str, Any],
) -> Education:
    safe_fields = {k: v for k, v in updates.items() if k in _UPDATABLE_COLUMNS}
    for key, value in safe_fields.items():
        setattr(entry, key, value)
    await db.flush()
    await db.refresh(entry)
    return entry


async def delete(db: AsyncSession, entry: Education) -> None:
    await db.delete(entry)
    await db.flush()
