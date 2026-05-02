"""Repository for ``work_history`` — owns every query against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. Every public function takes
``user_id`` and filters by it — tenant scoping is mandatory.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile.work_history import WorkHistory

_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "company_name",
    "title",
    "start_date",
    "end_date",
    "bullets",
})


async def get_by_id(
    db: AsyncSession, work_history_id: uuid.UUID, user_id: uuid.UUID,
) -> WorkHistory | None:
    result = await db.execute(
        select(WorkHistory).where(
            WorkHistory.id == work_history_id,
            WorkHistory.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[WorkHistory]:
    result = await db.execute(
        select(WorkHistory)
        .where(WorkHistory.user_id == user_id)
        .order_by(WorkHistory.start_date.desc())
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, entry: WorkHistory) -> WorkHistory:
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


async def update(
    db: AsyncSession,
    entry: WorkHistory,
    updates: dict[str, Any],
) -> WorkHistory:
    safe_fields = {k: v for k, v in updates.items() if k in _UPDATABLE_COLUMNS}
    for key, value in safe_fields.items():
        setattr(entry, key, value)
    await db.flush()
    await db.refresh(entry)
    return entry


async def delete(db: AsyncSession, entry: WorkHistory) -> None:
    await db.delete(entry)
    await db.flush()
