"""Refresh WoW Forever auction-house prices from their providers.

Run by the scheduler (``refresh_wow_prices``, every
``WOW_PRICE_REFRESH_INTERVAL_HOURS`` and once at boot) and by
``python -m app.cli refresh-wow-prices``. Prices are US only, so there is one
feed per provider, each its own transaction:

* a 304 / "not modified" only stamps ``checked_at``;
* new prices replace the feed's set atomically (upsert + delete the rest);
* any failure — HTTP error, network, a changed CSV header — is logged at
  WARNING with the status, recorded on the feed, and the stored prices stay;
* a file with no prices never wipes a feed that has some (a region file that
  suddenly goes empty is far likelier a TSM hiccup than a market with nothing
  on it).

Two API workers both run the scheduler; a per-feed advisory lock makes the
second one skip a feed the first is refreshing.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_prices import PRICE_REGION, WOW_FOREVER_GAME_SLUG
from app.db.session import unit_of_work
from app.models.wow.price_feed import WowPriceFeed
from app.repositories.game.game_repo import get_game_by_slug
from app.repositories.wow import item_price_repo, price_feed_repo
from app.services.wow.prices.feed_refresh import (
    OUTCOME_EMPTY,
    OUTCOME_FAILED,
    OUTCOME_LOCKED,
    OUTCOME_NOT_MODIFIED,
    OUTCOME_UPDATED,
    FeedRefresh,
)
from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.price_provider import PriceProvider
from app.services.wow.prices.price_row_mapper import to_price_rows
from app.services.wow.prices.tsm_provider import TsmPriceProvider

logger = logging.getLogger(__name__)

_ERROR_MAX = 500


def default_providers() -> list[PriceProvider]:
    return [TsmPriceProvider()]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _record_failure(feed: WowPriceFeed, message: str, at: datetime) -> None:
    price_feed_repo.update(feed, {"checked_at": at, "last_error": message[:_ERROR_MAX], "last_error_at": at})


async def refresh_feed(
    db: AsyncSession,
    provider: PriceProvider,
    game_id: uuid.UUID,
    *,
    now: datetime | None = None,
) -> FeedRefresh:
    """Refresh the provider's US feed inside the caller's transaction."""
    at = now or _now()
    region = PRICE_REGION
    feed = await price_feed_repo.get_or_create(db, game_id, region, provider.ruleset, provider.source)
    if not await price_feed_repo.try_lock(db, feed.id):
        logger.info("wow prices: %s/%s is being refreshed by another worker — skipped", provider.source, region)
        return FeedRefresh(region, provider.source, OUTCOME_LOCKED, feed.item_count)
    await price_feed_repo.reload(db, feed)

    try:
        result = await provider.fetch(region, etag=feed.etag, last_modified=feed.last_modified)
    except PriceFetchError as exc:
        logger.warning(
            "wow prices: %s/%s refresh failed (status=%s): %s — keeping %d stored prices",
            provider.source, region, exc.status_code, exc.reason, feed.item_count,
        )
        _record_failure(feed, exc.summary(), at)
        await price_feed_repo.flush(db)
        return FeedRefresh(region, provider.source, OUTCOME_FAILED, feed.item_count)

    if result.not_modified:
        price_feed_repo.update(feed, {"checked_at": at, "last_error": None, "last_error_at": None})
        await price_feed_repo.flush(db)
        return FeedRefresh(region, provider.source, OUTCOME_NOT_MODIFIED, feed.item_count)

    if not result.prices:
        if feed.item_count:
            # Don't store the validators either, so the next run downloads it again.
            logger.warning(
                "wow prices: %s/%s answered with no prices — keeping %d stored prices",
                provider.source, region, feed.item_count,
            )
            _record_failure(feed, "the source answered with no prices", at)
        else:
            price_feed_repo.update(feed, {
                "checked_at": at,
                "etag": result.etag,
                "last_modified": result.last_modified,
                "last_error": None,
                "last_error_at": None,
            })
        await price_feed_repo.flush(db)
        return FeedRefresh(region, provider.source, OUTCOME_EMPTY, feed.item_count)

    await item_price_repo.upsert_many(db, to_price_rows(feed.id, result.prices, at))
    await item_price_repo.delete_except(db, feed.id, [p.item_id for p in result.prices])
    price_feed_repo.update(feed, {
        "etag": result.etag,
        "last_modified": result.last_modified,
        "source_updated_at": max(p.source_updated_at for p in result.prices),
        "fetched_at": at,
        "checked_at": at,
        "item_count": len(result.prices),
        "last_error": None,
        "last_error_at": None,
    })
    await price_feed_repo.flush(db)
    logger.info("wow prices: %s/%s updated — %d items", provider.source, region, len(result.prices))
    return FeedRefresh(region, provider.source, OUTCOME_UPDATED, len(result.prices))


async def refresh_all(providers: Sequence[PriceProvider] | None = None) -> list[FeedRefresh]:
    """Refresh every provider's US feed, each in its own transaction.

    One feed failing never stops the others. Returns what happened to each.
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

    outcomes: list[FeedRefresh] = []
    for provider in providers if providers is not None else default_providers():
        try:
            async with unit_of_work() as db:
                outcomes.append(await refresh_feed(db, provider, game_id))
        except Exception:
            # A DB error mid-write rolls the whole feed back: the old prices stay.
            logger.exception("wow prices: %s/%s refresh crashed — stored prices kept", provider.source, PRICE_REGION)
            outcomes.append(FeedRefresh(PRICE_REGION, provider.source, OUTCOME_FAILED, 0))
    return outcomes
