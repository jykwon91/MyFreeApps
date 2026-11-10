"""Refresh WoW Forever auction-house prices from Blizzard, one set per mapped house.

Run by the scheduler (``refresh_wow_prices``, every
``WOW_PRICE_REFRESH_INTERVAL_HOURS`` and once at boot) and by
``python -m app.cli refresh-wow-prices``. Prices are US only; one refresh
reads every mapped house (``PRICE_SERVER_HOUSES``) and stores one feed per
house — each house is its own server market, never pooled:

* new prices replace the house's set atomically (upsert + delete the rest);
* any failure — no credentials, a refused token, an HTTP error with
  Blizzard's code, a network error, a mapped house the index lists under
  another faction — is logged at WARNING with the status and code, recorded
  on the feed, and the stored prices stay;
* a house with nothing listed never wipes a set that has prices (a mapped
  house answering empty is far likelier a Blizzard hiccup than an empty market).

A per-game advisory lock, taken before anything is fetched, makes an
overlapping run (the scheduler and the CLI at once) skip.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_prices import PRICE_REGION, WOW_FOREVER_GAME_SLUG
from app.db.session import unit_of_work
from app.models.wow.price_feed import WowPriceFeed
from app.repositories.game.game_repo import get_game_by_slug
from app.repositories.wow import item_price_repo, price_feed_repo
from app.services.wow.prices.blizzard_price_fetch import PriceFetch, fetch_house_prices
from app.services.wow.prices.feed_refresh import (
    OUTCOME_EMPTY,
    OUTCOME_FAILED,
    OUTCOME_LOCKED,
    OUTCOME_UPDATED,
    FeedRefresh,
)
from app.services.wow.prices.house_prices import HousePrices
from app.services.wow.prices.mapped_house import MappedHouse
from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.price_houses import mapped_houses
from app.services.wow.prices.price_row_mapper import to_price_rows

logger = logging.getLogger(__name__)

_ERROR_MAX = 500


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _record_failure(feed: WowPriceFeed, message: str, at: datetime) -> None:
    price_feed_repo.update(feed, {"checked_at": at, "last_error": message[:_ERROR_MAX], "last_error_at": at})


def _outcome(house: MappedHouse, outcome: str, item_count: int) -> FeedRefresh:
    return FeedRefresh(PRICE_REGION, house, outcome, item_count)


async def store_house(
    db: AsyncSession,
    game_id: uuid.UUID,
    house: MappedHouse,
    result: HousePrices | PriceFetchError,
    at: datetime,
) -> FeedRefresh:
    """Store one house's fetch result inside the caller's transaction."""
    region = PRICE_REGION
    label = f"{region}/{house.label}"
    feed = await price_feed_repo.get_or_create(db, game_id, region, house.house_id, house.faction)

    if isinstance(result, PriceFetchError):
        logger.warning(
            "wow prices: %s refresh failed (status=%s code=%s): %s — keeping %d stored prices",
            label, result.status_code, result.code, result.reason, feed.item_count,
        )
        _record_failure(feed, result.summary(), at)
        await price_feed_repo.flush(db)
        return _outcome(house, OUTCOME_FAILED, feed.item_count)

    if not result.prices:
        if feed.item_count:
            logger.warning("wow prices: %s listed nothing — keeping %d stored prices", label, feed.item_count)
            _record_failure(feed, "Blizzard's house listed nothing", at)
        else:
            price_feed_repo.update(feed, {"checked_at": at, "last_error": None, "last_error_at": None})
        await price_feed_repo.flush(db)
        return _outcome(house, OUTCOME_EMPTY, feed.item_count)

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
    logger.info("wow prices: %s updated — %d items", label, len(result.prices))
    return _outcome(house, OUTCOME_UPDATED, len(result.prices))


async def refresh_all(fetch: PriceFetch | None = None, *, now: datetime | None = None) -> list[FeedRefresh]:
    """Read every mapped house and store each one's set. Returns what happened to each house.

    The whole refresh is one transaction holding the game's lock, so a
    reader sees every house's old set or every house's new one.
    """
    houses = mapped_houses()
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
                return [_outcome(house, OUTCOME_LOCKED, 0) for house in houses]
            results = await (fetch or fetch_house_prices)()
            at = now or _now()
            return [await store_house(db, game_id, house, results[house.house_id], at) for house in houses]
    except Exception:
        # A DB error mid-write rolls every house back: the old prices stay.
        logger.exception("wow prices: refresh crashed — stored prices kept")
        return [_outcome(house, OUTCOME_FAILED, 0) for house in houses]
