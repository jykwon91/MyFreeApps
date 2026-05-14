"""Drop + Slot repository -- all ORM operations for the drops feature.

Repositories are thin: they take an AsyncSession plus primitive args and
return ORM rows. Business rules (status transition guards, "can-delete"
checks) live in the service layer.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.drop.drop import Drop
from app.models.drop.slot import Slot


async def create_drop(db: AsyncSession, data: dict) -> Drop:
    drop = Drop(**data)
    db.add(drop)
    await db.flush()
    await db.refresh(drop, attribute_names=["slots"])
    return drop


async def get_drop(db: AsyncSession, drop_id: uuid.UUID) -> Optional[Drop]:
    stmt = (
        select(Drop)
        .where(Drop.id == drop_id)
        .options(selectinload(Drop.slots))
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_drops(
    db: AsyncSession,
    *,
    status: Optional[str] = None,
) -> list[Drop]:
    """Return drops newest-date first; optionally filter by status."""
    stmt = (
        select(Drop)
        .options(selectinload(Drop.slots))
        .order_by(Drop.date.desc(), Drop.created_at.desc())
    )
    if status is not None:
        stmt = stmt.where(Drop.status == status)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_drop(db: AsyncSession, drop: Drop, patch: dict) -> Drop:
    for key, value in patch.items():
        setattr(drop, key, value)
    await db.flush()
    await db.refresh(drop, attribute_names=["slots"])
    return drop


async def delete_drop(db: AsyncSession, drop: Drop) -> None:
    await db.delete(drop)
    await db.flush()


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------

async def create_slot(db: AsyncSession, drop_id: uuid.UUID, data: dict) -> Slot:
    slot = Slot(drop_id=drop_id, **data)
    db.add(slot)
    await db.flush()
    return slot


async def get_slot(db: AsyncSession, slot_id: uuid.UUID) -> Optional[Slot]:
    stmt = select(Slot).where(Slot.id == slot_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_slots_for_drop(db: AsyncSession, drop_id: uuid.UUID) -> list[Slot]:
    stmt = (
        select(Slot)
        .where(Slot.drop_id == drop_id)
        .order_by(Slot.pickup_time.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_slot(db: AsyncSession, slot: Slot, patch: dict) -> Slot:
    for key, value in patch.items():
        setattr(slot, key, value)
    await db.flush()
    return slot


async def delete_slot(db: AsyncSession, slot: Slot) -> None:
    await db.delete(slot)
    await db.flush()


async def count_slots_for_drop(db: AsyncSession, drop_id: uuid.UUID) -> int:
    from sqlalchemy import func
    stmt = select(func.count(Slot.id)).where(Slot.drop_id == drop_id)
    result = await db.execute(stmt)
    return int(result.scalar_one())
