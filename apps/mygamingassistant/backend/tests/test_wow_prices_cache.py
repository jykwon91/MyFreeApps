"""WoW AH prices — ETag short-circuit, in-process cache, and weak ETag matching.

Supplements ``test_wow_prices_refresh.py`` with the new performance and
correctness behaviours from the AH prices cache PR:

  - 304 short-circuit: ``If-None-Match`` that matches the feed-row ETag returns
    304 without loading the ~6 850 item-price rows.
  - In-process cache: the first 200 populates ``price_response_cache``; a
    second 200 with the same ETag is served from bytes.
  - Cache invalidation: a new ``fetched_at`` → new ETag → cache miss → fresh load.
  - Weak ETag comparison: ``W/"hash"`` (sent by browsers after Caddy's
    ``encode`` module weakens a strong ETag) still yields 304.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_prices import PRICE_FACTIONS, PRICE_SERVER_HOUSES, WOW_FOREVER_GAME_SLUG
from app.models.game.game import Game
from app.models.wow.price_feed import WowPriceFeed
from app.repositories.game.game_repo import get_game_by_slug
from app.services.wow.prices import price_refresh_service, price_response_cache
from app.services.wow.prices.auction_item_price import AuctionItemPrice
from app.services.wow.prices.house_prices import HousePrices
from app.api.wow_prices import _etags_weakly_match

URL = "/api/wow/prices"
SNAPSHOT = datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc)
NOW = datetime(2026, 11, 20, 11, 0, tzinfo=timezone.utc)
LATER = NOW + timedelta(hours=3)
PVP = PRICE_SERVER_HOUSES["pvp"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _price(item_id: int, market_value: int) -> AuctionItemPrice:
    return AuctionItemPrice(item_id=item_id, market_value=market_value, min_buyout=market_value - 1, quantity=10, listing_count=2)


def _set(*prices: AuctionItemPrice, snapshot: datetime = SNAPSHOT) -> HousePrices:
    return HousePrices(prices=list(prices), snapshot_at=snapshot)


class FakeBlizzard:
    def __init__(self, results: dict[str, HousePrices]) -> None:
        self._results = results

    async def __call__(self, **_kwargs: Any) -> dict[int, HousePrices]:
        return {PVP[f]: self._results.get(f, _set()) for f in PRICE_FACTIONS}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def wow_game(db: AsyncSession) -> Game:
    game = await get_game_by_slug(db, WOW_FOREVER_GAME_SLUG)
    if game is None:
        game = Game(slug=WOW_FOREVER_GAME_SLUG, name="World of Warcraft: Forever", kind="companion")
        db.add(game)
        await db.flush()
    await db.execute(delete(WowPriceFeed).where(WowPriceFeed.game_id == game.id))
    return game


# ---------------------------------------------------------------------------
# 304 short-circuit
# ---------------------------------------------------------------------------

async def test_304_short_circuit_on_matching_etag(client: AsyncClient, wow_game: Game) -> None:
    """A matching If-None-Match returns 304 without loading item rows."""
    await price_refresh_service.refresh_all(
        FakeBlizzard({"alliance": _set(_price(2589, 28))}), now=NOW,
    )

    first = await client.get(URL)
    assert first.status_code == 200
    etag = first.headers["etag"]

    again = await client.get(URL, headers={"If-None-Match": etag})
    assert again.status_code == 304
    assert again.headers["cache-control"] == "public, max-age=600"
    assert again.headers["etag"] == etag
    assert again.content == b""


async def test_304_uses_feed_etag_before_item_rows(client: AsyncClient, wow_game: Game) -> None:
    """ETag computed from feed row alone is the same as the full served_prices ETag.

    This confirms quick_etag and served_prices agree — if they ever diverged,
    a 304 from quick_etag would leave the client with the wrong ETag.
    """
    await price_refresh_service.refresh_all(
        FakeBlizzard({"alliance": _set(_price(2589, 28), _price(4611, 3300))}), now=NOW,
    )

    first = await client.get(URL)
    etag_full = first.headers["etag"]

    conditional = await client.get(URL, headers={"If-None-Match": etag_full})
    assert conditional.status_code == 304
    assert conditional.headers["etag"] == etag_full


async def test_etag_changes_after_new_refresh(client: AsyncClient, wow_game: Game) -> None:
    """A new price set produces a new ETag; old If-None-Match gets a 200."""
    await price_refresh_service.refresh_all(FakeBlizzard({"alliance": _set(_price(2589, 28))}), now=NOW)
    first_etag = (await client.get(URL)).headers["etag"]

    await price_refresh_service.refresh_all(FakeBlizzard({"alliance": _set(_price(2589, 30))}), now=LATER)

    resp = await client.get(URL, headers={"If-None-Match": first_etag})
    assert resp.status_code == 200
    assert resp.headers["etag"] != first_etag


# ---------------------------------------------------------------------------
# Weak ETag comparison (_etags_weakly_match)
# ---------------------------------------------------------------------------

class TestWeakETagComparison:
    """Unit tests for the RFC 7232 weak comparison helper."""

    def test_strong_etag_matches_itself(self) -> None:
        assert _etags_weakly_match('"abc123"', '"abc123"')

    def test_weak_etag_matches_strong(self) -> None:
        """W/"hash" (Caddy encode output) weakly matches "hash" (backend ETag)."""
        assert _etags_weakly_match('W/"abc123"', '"abc123"')

    def test_different_etags_do_not_match(self) -> None:
        assert not _etags_weakly_match('"abc123"', '"def456"')

    def test_weak_different_etags_do_not_match(self) -> None:
        assert not _etags_weakly_match('W/"abc123"', '"def456"')

    def test_empty_etag_does_not_match(self) -> None:
        assert not _etags_weakly_match("", '"abc123"')

    def test_weak_matches_weak(self) -> None:
        assert _etags_weakly_match('W/"abc123"', 'W/"abc123"')


async def test_weak_etag_still_yields_304(client: AsyncClient, wow_game: Game) -> None:
    """A W/"..." If-None-Match header (from Caddy encode) gives 304, not 200.

    This is the Caddy round-trip test: Caddy's encode module weakens the strong
    ETag from "hash" to W/"hash" before sending it to the browser. The browser
    then sends W/"hash" as If-None-Match. The backend must accept it.
    """
    await price_refresh_service.refresh_all(
        FakeBlizzard({"alliance": _set(_price(2589, 28))}), now=NOW,
    )

    first = await client.get(URL)
    etag = first.headers["etag"]  # strong: "abc..."

    # Simulate what Caddy encode does: weaken the ETag.
    weak_etag = f'W/{etag}'

    resp = await client.get(URL, headers={"If-None-Match": weak_etag})
    assert resp.status_code == 304, (
        f"Expected 304 with weak If-None-Match W/{etag!r}; got {resp.status_code}. "
        "The backend must use weak ETag comparison so Caddy's encode doesn't break 304s."
    )


# ---------------------------------------------------------------------------
# In-process cache
# ---------------------------------------------------------------------------

async def test_cache_miss_on_first_request_then_hit(client: AsyncClient, wow_game: Game) -> None:
    """First request (cache miss) stores bytes; second request serves from cache."""
    await price_refresh_service.refresh_all(
        FakeBlizzard({"alliance": _set(_price(2589, 28))}), now=NOW,
    )

    first = await client.get(URL)
    assert first.status_code == 200
    etag = first.headers["etag"]

    # Cache should now be populated.
    assert price_response_cache.get(etag) is not None

    second = await client.get(URL)
    assert second.status_code == 200
    assert second.headers["etag"] == first.headers["etag"]
    assert second.json()["items"] == first.json()["items"]


async def test_cache_invalidated_on_new_fetched_at(client: AsyncClient, wow_game: Game) -> None:
    """New fetched_at → new ETag → cache miss → fresh bytes stored under new key."""
    await price_refresh_service.refresh_all(FakeBlizzard({"alliance": _set(_price(2589, 28))}), now=NOW)
    first = await client.get(URL)
    etag_v1 = first.headers["etag"]

    await price_refresh_service.refresh_all(FakeBlizzard({"alliance": _set(_price(2589, 999))}), now=LATER)
    second = await client.get(URL)
    etag_v2 = second.headers["etag"]

    assert etag_v1 != etag_v2
    assert price_response_cache.get(etag_v2) is not None
    # v2 response has the new price.
    assert second.json()["items"][0][1] == 999


async def test_cache_put_get_roundtrip() -> None:
    """Unit test: put() then get() returns the same bytes."""
    from app.services.wow.prices.price_response_cache import PriceResponseCache

    cache = PriceResponseCache()
    body = b'{"items":[]}'
    cache.put('"etag1"', body)
    assert cache.get('"etag1"') == body
    assert cache.get('"other"') is None


async def test_cache_evicts_on_overflow() -> None:
    """When the cache exceeds _MAX_ENTRIES, old entries are cleared on a new put."""
    from app.services.wow.prices.price_response_cache import PriceResponseCache, _MAX_ENTRIES

    cache = PriceResponseCache()
    for i in range(_MAX_ENTRIES):
        cache.put(f'"etag{i}"', b"x")
    # Cache is full; adding a new key should clear the dict first.
    cache.put('"new_etag"', b"y")
    assert cache.get('"new_etag"') == b"y"
    # Old entries were evicted.
    assert cache.get('"etag0"') is None
