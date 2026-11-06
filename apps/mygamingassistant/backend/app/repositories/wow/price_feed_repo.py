"""WowPriceFeed repository — one row per (game, region, ruleset, source).

Standalone functions like the other MGA repositories. The caller owns the
transaction; these only flush.
"""
from __future__ import annotations

import uuid
import zlib

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.price_feed import WowPriceFeed

# Advisory-lock namespace (first int of the two-int form) for price refreshes.
_LOCK_NAMESPACE = zlib.crc32(b"mga.wow_price_feed") & 0x7FFFFFFF


async def get(
    db: AsyncSession, game_id: uuid.UUID, region: str, ruleset: str | None, source: str,
) -> WowPriceFeed | None:
    result = await db.execute(
        select(WowPriceFeed).where(
            WowPriceFeed.game_id == game_id,
            WowPriceFeed.region == region,
            WowPriceFeed.ruleset.is_(None) if ruleset is None else WowPriceFeed.ruleset == ruleset,
            WowPriceFeed.source == source,
        )
    )
    return result.scalar_one_or_none()


async def get_or_create(
    db: AsyncSession, game_id: uuid.UUID, region: str, ruleset: str | None, source: str,
) -> WowPriceFeed:
    """The feed row, inserted on first use. Safe when two workers race."""
    await db.execute(
        insert(WowPriceFeed)
        .values(game_id=game_id, region=region, ruleset=ruleset, source=source)
        .on_conflict_do_nothing(constraint="uq_wowpricefeed_key")
    )
    feed = await get(db, game_id, region, ruleset, source)
    if feed is None:
        raise RuntimeError(f"price feed {region}/{ruleset}/{source} missing right after insert")
    return feed


async def try_lock(db: AsyncSession, feed_id: uuid.UUID) -> bool:
    """Take this feed's refresh lock for the rest of the transaction.

    False when another worker holds it — that worker is refreshing the same
    feed, so this one can skip. Released automatically on commit / rollback.
    """
    key = zlib.crc32(feed_id.bytes) & 0x7FFFFFFF
    result = await db.execute(
        text("SELECT pg_try_advisory_xact_lock(:ns, :key)"), {"ns": _LOCK_NAMESPACE, "key": key},
    )
    return bool(result.scalar_one())


async def reload(db: AsyncSession, feed: WowPriceFeed) -> None:
    """Re-read the feed once locked, so its validators are the latest committed ones."""
    await db.refresh(feed)


def update(feed: WowPriceFeed, values: dict[str, object]) -> None:
    for field, value in values.items():
        setattr(feed, field, value)


async def flush(db: AsyncSession) -> None:
    await db.flush()
