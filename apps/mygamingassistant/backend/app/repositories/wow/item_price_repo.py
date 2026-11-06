"""WowItemPrice repository — the prices in one feed.

The caller owns the transaction: a refresh replaces a feed's prices with
``upsert_many`` + ``delete_except`` inside one transaction, so a reader sees
the old set or the new one, never half of each.
"""
from __future__ import annotations

import uuid
from collections.abc import Collection, Sequence
from typing import Any

from sqlalchemy import Integer, all_, bindparam, delete, select
from sqlalchemy.dialects.postgresql import ARRAY, insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.item_price import WowItemPrice

# asyncpg caps a statement at 32767 bind parameters; a row binds 11.
_UPSERT_BATCH = 2000

_UPDATED_COLUMNS = (
    "name",
    "market_value",
    "historical",
    "avg_sale_price",
    "sale_rate",
    "sold_per_day",
    "source_updated_at",
    "fetched_at",
    "updated_at",
)


async def list_for_feed(db: AsyncSession, feed_id: uuid.UUID) -> list[WowItemPrice]:
    result = await db.execute(
        select(WowItemPrice).where(WowItemPrice.feed_id == feed_id).order_by(WowItemPrice.item_id)
    )
    return list(result.scalars().all())


async def upsert_many(db: AsyncSession, rows: Sequence[dict[str, Any]]) -> None:
    """Insert or update by (feed_id, item_id)."""
    # Same order every time, so two writers lock rows in the same order.
    ordered = sorted(rows, key=lambda row: (str(row["feed_id"]), row["item_id"]))
    for start in range(0, len(ordered), _UPSERT_BATCH):
        stmt = insert(WowItemPrice).values(ordered[start : start + _UPSERT_BATCH])
        stmt = stmt.on_conflict_do_update(
            constraint="uq_wowitemprice_feed_item",
            set_={column: stmt.excluded[column] for column in _UPDATED_COLUMNS},
        )
        await db.execute(stmt)


async def delete_except(db: AsyncSession, feed_id: uuid.UUID, keep_item_ids: Collection[int]) -> int:
    """Delete the feed's prices for items not in ``keep_item_ids``. Returns the count."""
    result = await db.execute(
        delete(WowItemPrice).where(
            WowItemPrice.feed_id == feed_id,
            # One array parameter, not one bind per id (asyncpg's 32767 cap).
            WowItemPrice.item_id != all_(bindparam("keep_item_ids", list(keep_item_ids), type_=ARRAY(Integer))),
        )
    )
    return int(result.rowcount or 0)
