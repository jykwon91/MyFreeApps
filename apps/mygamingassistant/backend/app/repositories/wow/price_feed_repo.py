"""WowPriceFeed repository — one row per (game, region, auction house).

Standalone functions like the other MGA repositories. The caller owns the
transaction; these only flush.
"""
from __future__ import annotations

import uuid
import zlib
from datetime import datetime

from sqlalchemy import or_, select, text, update as sql_update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.price_feed import WowPriceFeed

# Advisory-lock namespace (first int of the two-int form) for price refreshes.
_LOCK_NAMESPACE = zlib.crc32(b"mga.wow_price_feed") & 0x7FFFFFFF


async def get(db: AsyncSession, game_id: uuid.UUID, region: str, house_id: int) -> WowPriceFeed | None:
    result = await db.execute(
        select(WowPriceFeed).where(
            WowPriceFeed.game_id == game_id,
            WowPriceFeed.region == region,
            WowPriceFeed.house_id == house_id,
        )
    )
    return result.scalar_one_or_none()


async def get_or_create(
    db: AsyncSession, game_id: uuid.UUID, region: str, house_id: int, faction: str,
) -> WowPriceFeed:
    """The house's feed row, inserted on first use. Safe when two workers race."""
    await db.execute(
        insert(WowPriceFeed)
        .values(game_id=game_id, region=region, house_id=house_id, faction=faction)
        .on_conflict_do_nothing(constraint="uq_wowpricefeed_key")
    )
    feed = await get(db, game_id, region, house_id)
    if feed is None:
        raise RuntimeError(f"price feed {region}/house {house_id} missing right after insert")
    return feed


def _lock_key(game_id: uuid.UUID) -> int:
    return zlib.crc32(game_id.bytes) & 0x7FFFFFFF


async def try_refresh_lock(db: AsyncSession, game_id: uuid.UUID) -> bool:
    """Take the game's price-refresh lock for the rest of the transaction.

    One refresh reads every mapped house, so the lock is per game. False
    when another worker holds it — that worker is already refreshing, so
    this one can skip. Released automatically on commit / rollback.
    """
    result = await db.execute(
        text("SELECT pg_try_advisory_xact_lock(:ns, :key)"), {"ns": _LOCK_NAMESPACE, "key": _lock_key(game_id)},
    )
    return bool(result.scalar_one())


async def refresh_in_progress(db: AsyncSession, game_id: uuid.UUID) -> bool:
    """True while some worker holds the game's price-refresh lock.

    Reads ``pg_locks`` instead of taking the lock to test it, so looking never makes a
    scheduled refresh that starts at the same moment skip.
    """
    result = await db.execute(
        text(
            "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted "
            "AND classid = CAST(:ns AS oid) AND objid = CAST(:key AS oid) AND objsubid = 2)"
        ),
        {"ns": _LOCK_NAMESPACE, "key": _lock_key(game_id)},
    )
    return bool(result.scalar_one())


async def claim_refresh(
    db: AsyncSession,
    game_id: uuid.UUID,
    region: str,
    house_id: int,
    faction: str,
    *,
    at: datetime,
    claimable_before: datetime,
) -> bool:
    """Take the right to refresh a house now: stamp ``checked_at`` with ``at`` unless the house
    was asked for since ``claimable_before``. One atomic UPDATE, so two clicks (or two workers)
    can't both win."""
    await get_or_create(db, game_id, region, house_id, faction)
    result = await db.execute(
        sql_update(WowPriceFeed)
        .where(
            WowPriceFeed.game_id == game_id,
            WowPriceFeed.region == region,
            WowPriceFeed.house_id == house_id,
            or_(WowPriceFeed.checked_at.is_(None), WowPriceFeed.checked_at <= claimable_before),
        )
        .values(checked_at=at)
        .returning(WowPriceFeed.id)
    )
    return result.scalar_one_or_none() is not None


def update(feed: WowPriceFeed, values: dict[str, object]) -> None:
    for field, value in values.items():
        setattr(feed, field, value)


async def flush(db: AsyncSession) -> None:
    await db.flush()
