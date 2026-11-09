"""Refresh WoW Forever auction-house prices from Blizzard, one set per faction.

Run by the scheduler (``refresh_wow_prices``, every
``WOW_PRICE_REFRESH_INTERVAL_HOURS`` and once at boot) and by
``python -m app.cli refresh-wow-prices``. Prices are US only; one refresh
reads every house and stores one feed per faction:

* new prices replace the faction's set atomically (upsert + delete the rest);
* any failure — no credentials, a refused token, an HTTP error with
  Blizzard's code, a network error, one house of the faction failing — is
  logged at WARNING with the status and code, recorded on the feed, and the
  stored prices stay;
* a faction with nothing listed never wipes a set that has prices (a house
  answering empty is far likelier a Blizzard hiccup than an empty market).

Two API workers both run the scheduler; a per-game advisory lock, taken
before anything is fetched, makes the second one skip.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_prices import PRICE_FACTIONS, PRICE_REGION, WOW_FOREVER_GAME_SLUG
from app.db.session import unit_of_work
from app.models.wow.price_feed import WowPriceFeed
from app.repositories.game.game_repo import get_game_by_slug
from app.repositories.wow import item_price_repo, price_feed_repo
from app.services.wow.prices.blizzard_price_fetch import PriceFetch, fetch_faction_prices
from app.services.wow.prices.faction_prices import FactionPrices
from app.services.wow.prices.feed_refresh import (
    OUTCOME_EMPTY,
    OUTCOME_FAILED,
    OUTCOME_LOCKED,
    OUTCOME_UPDATED,
    FeedRefresh,
)
from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.price_row_mapper import to_price_rows

logger = logging.getLogger(__name__)

_ERROR_MAX = 500


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _record_failure(feed: WowPriceFeed, message: str, at: datetime) -> None:
    price_feed_repo.update(feed, {"checked_at": at, "last_error": message[:_ERROR_MAX], "last_error_at": at})


async def store_faction(
    db: AsyncSession,
    game_id: uuid.UUID,
    faction: str,
    result: FactionPrices | PriceFetchError,
    at: datetime,
) -> FeedRefresh:
    """Store one faction's fetch result inside the caller's transaction."""
    region = PRICE_REGION
    feed = await price_feed_repo.get_or_create(db, game_id, region, faction)

    if isinstance(result, PriceFetchError):
        logger.warning(
            "wow prices: %s/%s refresh failed (status=%s code=%s): %s — keeping %d stored prices",
            region, faction, result.status_code, result.code, result.reason, feed.item_count,
        )
        _record_failure(feed, result.summary(), at)
        await price_feed_repo.flush(db)
        return FeedRefresh(region, faction, OUTCOME_FAILED, feed.item_count)

    if not result.prices:
        if feed.item_count:
            logger.warning(
                "wow prices: %s/%s houses listed nothing — keeping %d stored prices", region, faction, feed.item_count,
            )
            _record_failure(feed, "Blizzard's houses listed nothing", at)
        else:
            price_feed_repo.update(feed, {"checked_at": at, "last_error": None, "last_error_at": None})
        await price_feed_repo.flush(db)
        return FeedRefresh(region, faction, OUTCOME_EMPTY, feed.item_count)

    await item_price_repo.upsert_many(db, to_price_rows(feed.id, result.prices, at))
    await item_price_repo.delete_except(db, feed.id, [p.item_id for p in result.prices])
    price_feed_repo.update(feed, {
        "source_updated_at": result.snapshot_at,
        "fetched_at": at,
        "checked_at": at,
        "item_count": len(result.prices),
        "last_error": None,
        "last_error_at": None,
    })
    await price_feed_repo.flush(db)
    logger.info("wow prices: %s/%s updated — %d items", region, faction, len(result.prices))
    return FeedRefresh(region, faction, OUTCOME_UPDATED, len(result.prices))


async def refresh_all(fetch: PriceFetch | None = None, *, now: datetime | None = None) -> list[FeedRefresh]:
    """Read every house and store each faction's set. Returns what happened to each faction.

    The whole refresh is one transaction holding the game's lock, so a
    reader sees every faction's old set or every faction's new one.
    """
    async with unit_of_work() as db:
        game = await get_game_by_slug(db, WOW_FOREVER_GAME_SLUG)
        game_id = game.id if game else None
    if game_id is None:
        logger.warning(
            "wow prices: game %r not found — run `python -m app.cli load-fixtures`; nothing refreshed",
            WOW_FOREVER_GAME_SLUG,
        )
        return []

    try:
        async with unit_of_work() as db:
            if not await price_feed_repo.try_refresh_lock(db, game_id):
                logger.info("wow prices: another worker is refreshing — skipped")
                return [FeedRefresh(PRICE_REGION, faction, OUTCOME_LOCKED, 0) for faction in PRICE_FACTIONS]
            results = await (fetch or fetch_faction_prices)()
            at = now or _now()
            return [await store_faction(db, game_id, faction, results[faction], at) for faction in PRICE_FACTIONS]
    except Exception:
        # A DB error mid-write rolls every faction back: the old prices stay.
        logger.exception("wow prices: refresh crashed — stored prices kept")
        return [FeedRefresh(PRICE_REGION, faction, OUTCOME_FAILED, 0) for faction in PRICE_FACTIONS]
