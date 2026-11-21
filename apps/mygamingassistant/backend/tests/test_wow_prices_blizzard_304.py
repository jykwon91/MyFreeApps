"""WoW AH prices — Blizzard If-Modified-Since conditional GET.

Covers:
  - 304 path: no parse, prices kept, checked_at updated, errors cleared
  - Refresh-now click cleared on 304 (OUTCOME_NOT_MODIFIED not in _UNSTORED_OUTCOMES)
  - If-Modified-Since header sent when source_updated_at is stored
  - If-Modified-Since header not sent when no source_updated_at
  - If-Modified-Since not sent on the commodities endpoint
"""
from __future__ import annotations

from datetime import datetime, timezone
from email.utils import format_datetime as format_http_date
from typing import Any

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_prices import PRICE_FACTIONS, PRICE_SERVER_HOUSES, WOW_FOREVER_GAME_SLUG
from app.models.game.game import Game
from app.models.wow.price_feed import WowPriceFeed
from app.repositories.game.game_repo import get_game_by_slug
from app.repositories.wow import item_price_repo, price_feed_repo
from app.services.wow.prices import price_refresh_service
from app.services.wow.prices.auction_item_price import AuctionItemPrice
from app.services.wow.prices.blizzard_auction_client import BlizzardAuctionClient
from app.services.wow.prices.blizzard_price_fetch import HouseNotModified, HouseResults
from app.services.wow.prices.feed_refresh import OUTCOME_NOT_MODIFIED
from app.services.wow.prices.house_prices import HousePrices
from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.price_refresh_now_service import _UNSTORED_OUTCOMES

SNAPSHOT = datetime(2026, 11, 21, 1, 25, 8, tzinfo=timezone.utc)
SNAPSHOT_HTTP = "Sat, 21 Nov 2026 01:25:08 GMT"
NOW = datetime(2026, 11, 21, 2, 0, tzinfo=timezone.utc)
LATER = datetime(2026, 11, 21, 4, 0, tzinfo=timezone.utc)
PVP = PRICE_SERVER_HOUSES["pvp"]


def _price(item_id: int, market_value: int) -> AuctionItemPrice:
    return AuctionItemPrice(
        item_id=item_id, market_value=market_value, min_buyout=market_value - 1,
        quantity=10, listing_count=2,
    )


def _set(*prices: AuctionItemPrice, snapshot: datetime = SNAPSHOT) -> HousePrices:
    return HousePrices(prices=list(prices), snapshot_at=snapshot)


class FakeBlizzard:
    """Stand-in for the Blizzard fetch; supports returning HouseNotModified per house."""

    def __init__(
        self,
        results: dict[str, HousePrices | PriceFetchError],
        *,
        not_modified_house_ids: set[int] | None = None,
    ) -> None:
        self._results = results
        self._not_modified = not_modified_house_ids or set()

    async def __call__(self, **_kwargs: Any) -> HouseResults:
        result: HouseResults = {}
        for faction in PRICE_FACTIONS:
            hid = PVP[faction]
            if hid in self._not_modified:
                result[hid] = HouseNotModified(house_id=hid)
            else:
                result[hid] = self._results.get(faction, _set())
        return result


@pytest_asyncio.fixture
async def wow_game(db: AsyncSession) -> Game:
    game = await get_game_by_slug(db, WOW_FOREVER_GAME_SLUG)
    if game is None:
        game = Game(slug=WOW_FOREVER_GAME_SLUG, name="World of Warcraft: Forever", kind="companion")
        db.add(game)
        await db.flush()
    await db.execute(delete(WowPriceFeed).where(WowPriceFeed.game_id == game.id))
    return game


async def _stored(db: AsyncSession, game: Game, faction: str) -> dict[int, tuple[int, int, int, int]]:
    feed = await price_feed_repo.get(db, game.id, "us", PVP[faction])
    assert feed is not None
    return {
        r.item_id: (r.market_value, r.min_buyout, r.quantity, r.listing_count)
        for r in await item_price_repo.list_for_feed(db, feed.id)
    }


# ---------------------------------------------------------------------------
# Behavioral: 304 outcome
# ---------------------------------------------------------------------------

async def test_304_keeps_prices_and_updates_checked_at(
    bound_unit_of_work: AsyncSession, wow_game: Game,
) -> None:
    """On 304: prices unchanged, checked_at advances, fetched_at/source_updated_at stay."""
    # Seed prices.
    await price_refresh_service.refresh_all(
        FakeBlizzard({"alliance": _set(_price(2589, 28))}), now=NOW,
    )

    # 304 refresh.
    outcomes = await price_refresh_service.refresh_all(
        FakeBlizzard({}, not_modified_house_ids={PVP["alliance"], PVP["horde"], PVP["neutral"]}),
        now=LATER,
    )

    # Every house reports not_modified.
    assert all(o.outcome == OUTCOME_NOT_MODIFIED for o in outcomes)
    alliance_outcome = next(o for o in outcomes if o.house.faction == "alliance")
    assert alliance_outcome.item_count == 1  # kept

    db = bound_unit_of_work
    feed = await price_feed_repo.get(db, wow_game.id, "us", PVP["alliance"])
    assert feed.checked_at == LATER            # advanced
    assert feed.fetched_at == NOW              # unchanged
    assert feed.source_updated_at == SNAPSHOT  # unchanged
    assert feed.item_count == 1                # kept

    # Items still in DB.
    assert await _stored(db, wow_game, "alliance") == {2589: (28, 27, 10, 2)}


async def test_304_clears_prior_error_state(
    bound_unit_of_work: AsyncSession, wow_game: Game,
) -> None:
    """On 304: last_error is cleared (Blizzard is healthy, prices are confirmed current)."""
    await price_refresh_service.refresh_all(
        FakeBlizzard({"alliance": _set(_price(2589, 28))}), now=NOW,
    )

    # Inject an error on the alliance feed.
    db = bound_unit_of_work
    feed = await price_feed_repo.get(db, wow_game.id, "us", PVP["alliance"])
    price_feed_repo.update(feed, {"last_error": "HTTP 503: boom", "last_error_at": NOW})
    await db.flush()

    # 304 refresh.
    await price_refresh_service.refresh_all(
        FakeBlizzard({}, not_modified_house_ids={PVP["alliance"], PVP["horde"], PVP["neutral"]}),
        now=LATER,
    )

    feed_after = await price_feed_repo.get(db, wow_game.id, "us", PVP["alliance"])
    assert feed_after.last_error is None
    assert feed_after.last_error_at is None


def test_outcome_not_modified_keeps_cooldown() -> None:
    """OUTCOME_NOT_MODIFIED is not in _UNSTORED_OUTCOMES: click cleared, cooldown kept.

    In ``price_refresh_now_service.run()``:
    - ``finally: await _clear_request(...)`` always fires → click cleared.
    - ``if outcome in _UNSTORED_OUTCOMES: await _hand_back(...)`` does NOT fire → cooldown kept.
    This matches the behavior of a successful refresh (OUTCOME_UPDATED).
    """
    assert OUTCOME_NOT_MODIFIED not in _UNSTORED_OUTCOMES


# ---------------------------------------------------------------------------
# HTTP-level: If-Modified-Since header
# ---------------------------------------------------------------------------

def _blizzard_transport(*, return_304: bool) -> tuple[httpx.MockTransport, dict[str, str]]:
    """Mock transport that captures auction request headers and returns 200 or 304."""
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if "oauth.battle.net" in str(request.url):
            return httpx.Response(
                200,
                json={"access_token": "tok", "token_type": "bearer", "expires_in": 86400},
            )
        captured.update(dict(request.headers))
        if return_304:
            return httpx.Response(304, content=b"")
        return httpx.Response(
            200,
            headers={"Last-Modified": SNAPSHOT_HTTP},
            content=b'{"auctions":[]}',
        )

    return httpx.MockTransport(handler), captured


@pytest.mark.asyncio
async def test_if_modified_since_header_sent() -> None:
    """BlizzardAuctionClient sends If-Modified-Since on item-listings when if_modified_since is set."""
    transport, captured = _blizzard_transport(return_304=True)
    async with BlizzardAuctionClient("id", "secret", transport=transport) as client:
        async with client.house_auctions(110, commodities=False, if_modified_since=SNAPSHOT) as answer:
            assert answer.not_modified is True
            async for _ in answer.auctions:
                pass

    assert "if-modified-since" in captured, "header missing from request"
    assert captured["if-modified-since"] == SNAPSHOT_HTTP


@pytest.mark.asyncio
async def test_if_modified_since_header_not_sent_without_since() -> None:
    """BlizzardAuctionClient does NOT send If-Modified-Since when if_modified_since is None."""
    transport, captured = _blizzard_transport(return_304=False)
    async with BlizzardAuctionClient("id", "secret", transport=transport) as client:
        async with client.house_auctions(110, commodities=False, if_modified_since=None) as answer:
            assert answer.not_modified is False
            async for _ in answer.auctions:
                pass

    assert "if-modified-since" not in captured


@pytest.mark.asyncio
async def test_if_modified_since_not_sent_for_commodities() -> None:
    """If-Modified-Since is never sent on the commodities endpoint (only verified on item-listings)."""
    transport, captured = _blizzard_transport(return_304=False)
    async with BlizzardAuctionClient("id", "secret", transport=transport) as client:
        async with client.house_auctions(110, commodities=True, if_modified_since=SNAPSHOT) as answer:
            async for _ in answer.auctions:
                pass

    assert "if-modified-since" not in captured
