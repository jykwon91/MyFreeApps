"""WowMapCapture repository — ORM operations for ``wow_map_capture``.

Standalone functions like the other MGA repositories. The caller owns the
transaction (services use ``unit_of_work``); these only flush.
"""
from __future__ import annotations

from collections.abc import Collection

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.map_capture import WowMapCapture


async def list_all(db: AsyncSession) -> list[WowMapCapture]:
    result = await db.execute(
        select(WowMapCapture).order_by(WowMapCapture.kind, WowMapCapture.name, WowMapCapture.capture_key)
    )
    return list(result.scalars().all())


async def by_keys(db: AsyncSession, keys: Collection[str]) -> dict[str, WowMapCapture]:
    if not keys:
        return {}
    result = await db.execute(select(WowMapCapture).where(WowMapCapture.capture_key.in_(list(keys))))
    return {row.capture_key: row for row in result.scalars().all()}


def add(db: AsyncSession, values: dict[str, object]) -> WowMapCapture:
    row = WowMapCapture(**values)
    db.add(row)
    return row


async def delete_except(db: AsyncSession, keep_keys: Collection[str]) -> int:
    """Delete every capture whose key is not in ``keep_keys``. Returns the count."""
    result = await db.execute(
        delete(WowMapCapture).where(WowMapCapture.capture_key.not_in(list(keep_keys)))
    )
    await db.flush()
    return int(result.rowcount or 0)
