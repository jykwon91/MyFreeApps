"""WoW Forever auction-house prices — the scheduled refresh and GET /api/wow/prices.

Covers:
  - a refresh stores one set per faction; a second replaces it (items no
    longer listed are deleted)
  - a failed faction keeps its old prices and records Blizzard's code; the
    other factions still update
  - a faction whose houses suddenly list nothing keeps its old prices
  - a refresh another worker is running is skipped before fetching
  - a crash rolls back and reports every faction failed
  - the endpoint: public in both modes, compact columns, per-faction, ETag /
    304, an unknown faction is a 422, no prices yet is an empty list
  - the database rejects an unknown faction and a cheapest above the market value
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.wow_prices import PRICE_FACTIONS, WOW_FOREVER_GAME_SLUG
from app.models.game.game import Game
from app.models.wow.price_feed import WowPriceFeed
from app.repositories.game.game_repo import get_game_by_slug
from app.repositories.wow import item_price_repo, price_feed_repo
from app.services.wow.prices import price_refresh_service
from app.services.wow.prices.auction_item_price import AuctionItemPrice
from app.services.wow.prices.blizzard_price_fetch import FactionResults
from app.services.wow.prices.faction_prices import FactionPrices
from app.services.wow.prices.feed_refresh import OUTCOME_EMPTY, OUTCOME_FAILED, OUTCOME_LOCKED, OUTCOME_UPDATED
from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.price_row_mapper import to_price_rows

URL = "/api/wow/prices"
SNAPSHOT = datetime(2026, 11, 9, 17, 16, 22, tzinfo=timezone.utc)
NOW = datetime(2026, 11, 9, 18, 0, tzinfo=timezone.utc)
LATER = NOW + timedelta(hours=3)


def _price(item_id: int, market_value: int, min_buyout: int, quantity: int = 10, listings: int = 2) -> AuctionItemPrice:
    return AuctionItemPrice(
        item_id=item_id, market_value=market_value, min_buyout=min_buyout, quantity=quantity, listing_count=listings,
    )


LINEN = _price(2589, 28, 24, quantity=23_980, listings=910)
PEARL_ALLIANCE = _price(4611, 3300, 3000, quantity=601, listings=98)
PEARL_HORDE = _price(4611, 3495, 2999, quantity=982, listings=154)
DUST = _price(10940, 60, 55)
PYRITE = _price(249391, 104, 100)


def _set(*prices: AuctionItemPrice, snapshot: datetime = SNAPSHOT) -> FactionPrices:
    return FactionPrices(prices=list(prices), snapshot_at=snapshot)


class FakeBlizzard:
    """A stand-in for the Blizzard fetch: each faction's scripted result, empty for the rest."""

    def __init__(self, results: dict[str, FactionPrices | PriceFetchError]) -> None:
        self._results = results
        self.calls = 0

    async def __call__(self) -> FactionResults:
        self.calls += 1
        return {faction: self._results.get(faction, _set()) for faction in PRICE_FACTIONS}


def _fetch(**results: FactionPrices | PriceFetchError) -> FakeBlizzard:
    return FakeBlizzard(results)


@pytest_asyncio.fixture
async def wow_game(db: AsyncSession) -> Game:
    """The WoW Forever game with no price feeds (the dev DB may hold real ones)."""
    game = await get_game_by_slug(db, WOW_FOREVER_GAME_SLUG)
    if game is None:
        game = Game(slug=WOW_FOREVER_GAME_SLUG, name="World of Warcraft: Forever", kind="companion")
        db.add(game)
        await db.flush()
    await db.execute(delete(WowPriceFeed).where(WowPriceFeed.game_id == game.id))
    return game


async def _stored(db: AsyncSession, game: Game, faction: str) -> dict[int, tuple[int, int, int, int]]:
    feed = await price_feed_repo.get(db, game.id, "us", faction)
    assert feed is not None
    return {
        r.item_id: (r.market_value, r.min_buyout, r.quantity, r.listing_count)
        for r in await item_price_repo.list_for_feed(db, feed.id)
    }


# ---------------------------------------------------------------------------
# refresh_all
# ---------------------------------------------------------------------------

async def test_a_refresh_stores_one_set_per_faction(bound_unit_of_work: AsyncSession, wow_game: Game) -> None:
    outcomes = await price_refresh_service.refresh_all(
        _fetch(alliance=_set(LINEN, PEARL_ALLIANCE), horde=_set(PEARL_HORDE)), now=NOW,
    )

    assert [(o.region, o.faction, o.outcome, o.item_count) for o in outcomes] == [
        ("us", "alliance", OUTCOME_UPDATED, 2), ("us", "horde", OUTCOME_UPDATED, 1), ("us", "neutral", OUTCOME_EMPTY, 0),
    ]
    db = bound_unit_of_work
    assert await _stored(db, wow_game, "alliance") == {2589: (28, 24, 23_980, 910), 4611: (3300, 3000, 601, 98)}
    assert await _stored(db, wow_game, "horde") == {4611: (3495, 2999, 982, 154)}
    feed = await price_feed_repo.get(db, wow_game.id, "us", "alliance")
    assert feed.source_updated_at == SNAPSHOT and feed.fetched_at == NOW and feed.item_count == 2
    assert feed.last_error is None


async def test_a_second_refresh_replaces_the_set(bound_unit_of_work: AsyncSession, wow_game: Game) -> None:
    await price_refresh_service.refresh_all(_fetch(alliance=_set(LINEN, PEARL_ALLIANCE)), now=NOW)
    cheaper = _price(4611, 3100, 2900)
    await price_refresh_service.refresh_all(_fetch(alliance=_set(cheaper, DUST)), now=LATER)

    assert await _stored(bound_unit_of_work, wow_game, "alliance") == {4611: (3100, 2900, 10, 2), 10940: (60, 55, 10, 2)}


async def test_a_failed_faction_keeps_its_prices_and_records_the_code(
    bound_unit_of_work: AsyncSession, wow_game: Game, caplog: pytest.LogCaptureFixture,
) -> None:
    await price_refresh_service.refresh_all(_fetch(alliance=_set(LINEN), horde=_set(PEARL_HORDE)), now=NOW)
    error = PriceFetchError("Service Unavailable", status_code=503, code="BLZWEBAPI00000503")
    outcomes = await price_refresh_service.refresh_all(_fetch(alliance=error, horde=_set(DUST)), now=LATER)

    assert [(o.faction, o.outcome, o.item_count) for o in outcomes][:2] == [
        ("alliance", OUTCOME_FAILED, 1), ("horde", OUTCOME_UPDATED, 1),
    ]
    db = bound_unit_of_work
    assert await _stored(db, wow_game, "alliance") == {2589: (28, 24, 23_980, 910)}
    assert await _stored(db, wow_game, "horde") == {10940: (60, 55, 10, 2)}
    feed = await price_feed_repo.get(db, wow_game.id, "us", "alliance")
    assert feed.last_error == "HTTP 503 BLZWEBAPI00000503: Service Unavailable"
    assert feed.last_error_at == LATER and feed.checked_at == LATER and feed.fetched_at == NOW
    assert "status=503 code=BLZWEBAPI00000503" in caplog.text


async def test_houses_listing_nothing_never_wipe_stored_prices(bound_unit_of_work: AsyncSession, wow_game: Game) -> None:
    await price_refresh_service.refresh_all(_fetch(alliance=_set(LINEN)), now=NOW)
    outcomes = await price_refresh_service.refresh_all(_fetch(alliance=_set()), now=LATER)

    assert (outcomes[0].outcome, outcomes[0].item_count) == (OUTCOME_EMPTY, 1)
    assert await _stored(bound_unit_of_work, wow_game, "alliance") == {2589: (28, 24, 23_980, 910)}
    feed = await price_feed_repo.get(bound_unit_of_work, wow_game.id, "us", "alliance")
    assert feed.last_error == "Blizzard's houses listed nothing"


async def test_a_refresh_another_worker_is_running_is_skipped_before_fetching(
    bound_unit_of_work: AsyncSession, db_engine, wow_game: Game,
) -> None:
    fetch = _fetch(alliance=_set(LINEN))
    other_worker = async_sessionmaker(bind=db_engine)
    async with other_worker() as other, other.begin():
        assert await price_feed_repo.try_refresh_lock(other, wow_game.id)
        outcomes = await price_refresh_service.refresh_all(fetch, now=NOW)

    assert {o.outcome for o in outcomes} == {OUTCOME_LOCKED}
    assert fetch.calls == 0


async def test_a_crash_reports_every_faction_failed(bound_unit_of_work: AsyncSession, wow_game: Game) -> None:
    async def broken() -> FactionResults:
        raise RuntimeError("boom")

    outcomes = await price_refresh_service.refresh_all(broken, now=NOW)
    assert [(o.faction, o.outcome) for o in outcomes] == [(f, OUTCOME_FAILED) for f in PRICE_FACTIONS]


async def test_no_game_refreshes_nothing(bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    async def no_game(db: AsyncSession, slug: str) -> None:
        return None

    monkeypatch.setattr(price_refresh_service, "get_game_by_slug", no_game)
    fetch = _fetch()
    assert await price_refresh_service.refresh_all(fetch) == []
    assert fetch.calls == 0


# ---------------------------------------------------------------------------
# database constraints
# ---------------------------------------------------------------------------

async def test_an_unknown_faction_is_rejected_by_the_database(db: AsyncSession, wow_game: Game) -> None:
    with pytest.raises(IntegrityError, match="ck_wowpricefeed_faction"):
        async with db.begin_nested():
            await price_feed_repo.get_or_create(db, wow_game.id, "us", "goblin")


async def test_a_cheapest_above_the_market_value_is_rejected(db: AsyncSession, wow_game: Game) -> None:
    feed = await price_feed_repo.get_or_create(db, wow_game.id, "us", "alliance")
    with pytest.raises(IntegrityError, match="ck_wowitemprice_min_buyout"):
        async with db.begin_nested():
            await item_price_repo.upsert_many(db, to_price_rows(feed.id, [_price(2589, 20, 30)], NOW))


# ---------------------------------------------------------------------------
# GET /api/wow/prices
# ---------------------------------------------------------------------------

async def _refresh(**results: FactionPrices | PriceFetchError) -> None:
    await price_refresh_service.refresh_all(_fetch(**results), now=NOW)


async def test_endpoint_serves_compact_rows_for_alliance_by_default(client: AsyncClient, wow_game: Game) -> None:
    await _refresh(alliance=_set(LINEN, PEARL_ALLIANCE), horde=_set(PEARL_HORDE))

    resp = await client.get(URL)
    assert resp.status_code == 200
    body = resp.json()
    assert (body["region"], body["faction"]) == ("us", "alliance")
    assert "credit" not in body
    assert body["columns"] == ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"]
    assert body["items"] == [[2589, 28, 24, 23_980, 910, "Linen Cloth"], [4611, 3300, 3000, 601, 98, "Blue Pearl"]]
    assert body["source_updated_at"].startswith("2026-11-09T17:16:22")
    assert body["fetched_at"].startswith("2026-11-09T18:00:00")
    assert resp.headers["cache-control"] == "public, max-age=600"

    again = await client.get(URL, headers={"If-None-Match": resp.headers["etag"]})
    assert again.status_code == 304


async def test_each_faction_gets_its_own_prices_and_etag(client: AsyncClient, wow_game: Game) -> None:
    await _refresh(alliance=_set(PEARL_ALLIANCE), horde=_set(PEARL_HORDE))

    alliance = await client.get(URL, params={"faction": "alliance"})
    horde = await client.get(URL, params={"faction": "horde"})
    assert horde.json()["faction"] == "horde"
    assert horde.json()["items"] == [[4611, 3495, 2999, 982, 154, "Blue Pearl"]]
    assert alliance.headers["etag"] != horde.headers["etag"]
    # Alliance's ETag never answers 304 for Horde.
    assert (await client.get(URL, params={"faction": "horde"}, headers={"If-None-Match": alliance.headers["etag"]})).status_code == 200


async def test_items_are_named_from_the_forever_client(client: AsyncClient, wow_game: Game) -> None:
    await _refresh(alliance=_set(LINEN, PYRITE))
    items = (await client.get(URL)).json()["items"]
    assert [(row[0], row[5]) for row in items] == [(2589, "Linen Cloth"), (249391, "Pyrite")]


async def test_etag_changes_when_new_prices_land(client: AsyncClient, wow_game: Game) -> None:
    await _refresh(alliance=_set(LINEN))
    first = (await client.get(URL)).headers["etag"]
    await price_refresh_service.refresh_all(_fetch(alliance=_set(DUST)), now=LATER)

    resp = await client.get(URL, headers={"If-None-Match": first})
    assert resp.status_code == 200
    assert [row[0] for row in resp.json()["items"]] == [10940]


async def test_no_prices_yet_is_an_empty_list(client: AsyncClient, wow_game: Game) -> None:
    resp = await client.get(URL, params={"faction": "neutral"})
    assert resp.status_code == 200
    body = resp.json()
    assert (body["region"], body["faction"]) == ("us", "neutral")
    assert body["items"] == [] and body["fetched_at"] is None and body["source_updated_at"] is None


async def test_an_unknown_faction_is_a_422(client: AsyncClient, wow_game: Game) -> None:
    resp = await client.get(URL, params={"faction": "goblin"})
    assert resp.status_code == 422


async def test_endpoint_is_public_in_serve_only(serve_only_client: AsyncClient, wow_game: Game) -> None:
    await _refresh(horde=_set(DUST))
    resp = await serve_only_client.get(URL, params={"faction": "horde"})
    assert resp.status_code == 200
    assert resp.json()["items"][0][0] == 10940
