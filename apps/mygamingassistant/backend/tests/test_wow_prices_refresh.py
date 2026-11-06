"""WoW Forever auction-house prices — the scheduled refresh and GET /api/wow/prices.

Covers:
  - a refresh stores the prices + validators, a second one replaces the set
    (items gone from the file are deleted)
  - a failed fetch, and a file that suddenly has no prices, keep the old prices
  - a 304 only stamps the check; a locked feed is skipped (two API workers)
  - refresh_all keeps going past a feed that fails
  - the endpoint: public in both modes, compact columns, ETag / 304, bad region
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.wow_prices import PRICE_SOURCE_TSM, WOW_FOREVER_GAME_SLUG
from app.models.game.game import Game
from app.models.wow.price_feed import WowPriceFeed
from app.repositories.game.game_repo import get_game_by_slug
from app.repositories.wow import item_price_repo, price_feed_repo
from app.services.wow.prices import price_refresh_service
from app.services.wow.prices.feed_refresh import (
    OUTCOME_EMPTY,
    OUTCOME_FAILED,
    OUTCOME_LOCKED,
    OUTCOME_NOT_MODIFIED,
    OUTCOME_UPDATED,
)
from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.price_fetch_result import PriceFetchResult
from app.services.wow.prices.provider_price import ProviderPrice

URL = "/api/wow/prices"
UPDATED = datetime(2026, 11, 5, 14, 49, 31, tzinfo=timezone.utc)
NOW = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)


def _price(item_id: int, name: str, market_value: int, avg_sale_price: int | None = None) -> ProviderPrice:
    return ProviderPrice(
        item_id=item_id,
        name=name,
        market_value=market_value,
        historical=market_value,
        avg_sale_price=avg_sale_price,
        sale_rate=0.5,
        sold_per_day=12.0,
        source_updated_at=UPDATED,
    )


LINEN = _price(2589, "Linen Cloth", 28, 24)
WOOL = _price(2592, "Wool Cloth", 868, 229)
DUST = _price(10940, "Strange Dust", 60)


class FakeProvider:
    """Answers each fetch with the next scripted result (or raises it)."""

    source = PRICE_SOURCE_TSM
    ruleset: str | None = None

    def __init__(self, *answers: PriceFetchResult | Exception) -> None:
        self._answers = list(answers)
        self.calls: list[tuple[str, str | None, str | None]] = []

    async def fetch(self, region: str, *, etag: str | None, last_modified: str | None) -> PriceFetchResult:
        self.calls.append((region, etag, last_modified))
        answer = self._answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def _fresh(*prices: ProviderPrice, etag: str = '"v1"') -> PriceFetchResult:
    return PriceFetchResult(not_modified=False, prices=list(prices), etag=etag, last_modified="Thu, 05 Nov 2026 14:50:00 GMT")


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


async def _stored(db: AsyncSession, game: Game, region: str = "us") -> dict[int, int]:
    feed = await price_feed_repo.get(db, game.id, region, None, PRICE_SOURCE_TSM)
    assert feed is not None
    return {row.item_id: row.market_value for row in await item_price_repo.list_for_feed(db, feed.id)}


# ---------------------------------------------------------------------------
# refresh_feed
# ---------------------------------------------------------------------------

async def test_refresh_stores_prices_and_validators(db: AsyncSession, wow_game: Game) -> None:
    outcome = await price_refresh_service.refresh_feed(db, FakeProvider(_fresh(LINEN, WOOL)), wow_game.id, "us", now=NOW)
    assert (outcome.outcome, outcome.item_count) == (OUTCOME_UPDATED, 2)
    assert await _stored(db, wow_game) == {2589: 28, 2592: 868}

    feed = await price_feed_repo.get(db, wow_game.id, "us", None, PRICE_SOURCE_TSM)
    assert feed.etag == '"v1"'
    assert feed.source_updated_at == UPDATED
    assert feed.fetched_at == NOW and feed.checked_at == NOW
    assert feed.item_count == 2 and feed.last_error is None


async def test_second_refresh_replaces_the_set(db: AsyncSession, wow_game: Game) -> None:
    await price_refresh_service.refresh_feed(db, FakeProvider(_fresh(LINEN, WOOL)), wow_game.id, "us", now=NOW)
    cheaper_linen = _price(2589, "Linen Cloth", 31)
    provider = FakeProvider(_fresh(cheaper_linen, DUST, etag='"v2"'))
    await price_refresh_service.refresh_feed(db, provider, wow_game.id, "us", now=NOW + timedelta(hours=3))

    assert provider.calls == [("us", '"v1"', "Thu, 05 Nov 2026 14:50:00 GMT")]
    assert await _stored(db, wow_game) == {2589: 31, 10940: 60}  # wool left the file


async def test_failed_fetch_keeps_the_old_prices(db: AsyncSession, wow_game: Game, caplog: pytest.LogCaptureFixture) -> None:
    await price_refresh_service.refresh_feed(db, FakeProvider(_fresh(LINEN, WOOL)), wow_game.id, "us", now=NOW)
    later = NOW + timedelta(hours=3)
    outcome = await price_refresh_service.refresh_feed(
        db, FakeProvider(PriceFetchError("Service Unavailable", status_code=503)), wow_game.id, "us", now=later,
    )

    assert outcome.outcome == OUTCOME_FAILED
    assert await _stored(db, wow_game) == {2589: 28, 2592: 868}
    feed = await price_feed_repo.get(db, wow_game.id, "us", None, PRICE_SOURCE_TSM)
    assert feed.last_error == "HTTP 503: Service Unavailable"
    assert feed.last_error_at == later
    assert feed.fetched_at == NOW  # the prices shown are still the ones from NOW
    assert any(r.levelname == "WARNING" and "status=503" in r.getMessage() for r in caplog.records)


async def test_a_suddenly_empty_file_keeps_the_old_prices(db: AsyncSession, wow_game: Game) -> None:
    await price_refresh_service.refresh_feed(db, FakeProvider(_fresh(LINEN)), wow_game.id, "us", now=NOW)
    outcome = await price_refresh_service.refresh_feed(db, FakeProvider(_fresh(etag='"v2"')), wow_game.id, "us", now=NOW)

    assert outcome.outcome == OUTCOME_EMPTY
    assert await _stored(db, wow_game) == {2589: 28}
    feed = await price_feed_repo.get(db, wow_game.id, "us", None, PRICE_SOURCE_TSM)
    assert feed.etag == '"v1"'  # not the empty file's, so the next run downloads again
    assert feed.last_error is not None


async def test_header_only_region_is_empty_not_failed(db: AsyncSession, wow_game: Game) -> None:
    outcome = await price_refresh_service.refresh_feed(db, FakeProvider(_fresh(etag='"kr"')), wow_game.id, "kr", now=NOW)
    assert (outcome.outcome, outcome.item_count) == (OUTCOME_EMPTY, 0)
    feed = await price_feed_repo.get(db, wow_game.id, "kr", None, PRICE_SOURCE_TSM)
    assert feed.etag == '"kr"' and feed.last_error is None and feed.fetched_at is None


async def test_not_modified_only_stamps_the_check(db: AsyncSession, wow_game: Game) -> None:
    await price_refresh_service.refresh_feed(db, FakeProvider(_fresh(LINEN)), wow_game.id, "us", now=NOW)
    later = NOW + timedelta(hours=3)
    outcome = await price_refresh_service.refresh_feed(
        db, FakeProvider(PriceFetchResult(not_modified=True)), wow_game.id, "us", now=later,
    )

    assert outcome.outcome == OUTCOME_NOT_MODIFIED
    feed = await price_feed_repo.get(db, wow_game.id, "us", None, PRICE_SOURCE_TSM)
    assert feed.checked_at == later and feed.fetched_at == NOW
    assert await _stored(db, wow_game) == {2589: 28}


async def test_a_feed_another_worker_is_refreshing_is_skipped(db: AsyncSession, db_engine, wow_game: Game) -> None:
    feed = await price_feed_repo.get_or_create(db, wow_game.id, "us", None, PRICE_SOURCE_TSM)
    other_worker = async_sessionmaker(bind=db_engine)
    async with other_worker() as other, other.begin():
        assert await price_feed_repo.try_lock(other, feed.id)
        provider = FakeProvider()
        outcome = await price_refresh_service.refresh_feed(db, provider, wow_game.id, "us", now=NOW)

    assert outcome.outcome == OUTCOME_LOCKED
    assert provider.calls == []


# ---------------------------------------------------------------------------
# refresh_all
# ---------------------------------------------------------------------------

async def test_refresh_all_keeps_going_past_a_failing_feed(bound_unit_of_work: AsyncSession, wow_game: Game) -> None:
    provider = FakeProvider(PriceFetchError("boom", status_code=500), _fresh(LINEN))
    outcomes = await price_refresh_service.refresh_all(providers=[provider], regions=("us", "eu"))

    assert [(o.region, o.outcome) for o in outcomes] == [("us", OUTCOME_FAILED), ("eu", OUTCOME_UPDATED)]
    assert await _stored(bound_unit_of_work, wow_game, "eu") == {2589: 28}


# ---------------------------------------------------------------------------
# GET /api/wow/prices
# ---------------------------------------------------------------------------

async def test_endpoint_serves_compact_rows(client: AsyncClient, db: AsyncSession, wow_game: Game) -> None:
    await price_refresh_service.refresh_feed(db, FakeProvider(_fresh(LINEN, DUST)), wow_game.id, "us", now=NOW)

    resp = await client.get(URL, params={"region": "us"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["region"] == "us"
    assert body["credit"] == {"source": "tsm", "name": "TradeSkillMaster", "url": "https://www.tradeskillmaster.com"}
    assert body["columns"] == ["item_id", "market_value", "avg_sale_price", "historical", "sold_per_day", "name"]
    assert body["items"] == [[2589, 28, 24, 28, 12.0, "Linen Cloth"], [10940, 60, None, 60, 12.0, "Strange Dust"]]
    assert body["source_updated_at"].startswith("2026-11-05T14:49:31")
    assert body["fetched_at"].startswith("2026-11-06T12:00:00")
    assert resp.headers["cache-control"] == "public, max-age=600"

    again = await client.get(URL, params={"region": "us"}, headers={"If-None-Match": resp.headers["etag"]})
    assert again.status_code == 304


async def test_etag_changes_when_new_prices_land(client: AsyncClient, db: AsyncSession, wow_game: Game) -> None:
    await price_refresh_service.refresh_feed(db, FakeProvider(_fresh(LINEN)), wow_game.id, "us", now=NOW)
    first = (await client.get(URL)).headers["etag"]  # region defaults to us
    await price_refresh_service.refresh_feed(
        db, FakeProvider(_fresh(DUST, etag='"v2"')), wow_game.id, "us", now=NOW + timedelta(hours=3),
    )
    resp = await client.get(URL, headers={"If-None-Match": first})
    assert resp.status_code == 200
    assert [row[0] for row in resp.json()["items"]] == [10940]


async def test_region_with_no_prices_yet_is_an_empty_list(client: AsyncClient, wow_game: Game) -> None:
    resp = await client.get(URL, params={"region": "tw"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == [] and body["fetched_at"] is None
    assert body["credit"]["name"] == "TradeSkillMaster"


async def test_unknown_region_is_rejected(client: AsyncClient) -> None:
    assert (await client.get(URL, params={"region": "cn"})).status_code == 422


async def test_endpoint_is_public_in_serve_only(serve_only_client: AsyncClient, db: AsyncSession, wow_game: Game) -> None:
    await price_refresh_service.refresh_feed(db, FakeProvider(_fresh(WOOL)), wow_game.id, "eu", now=NOW)
    resp = await serve_only_client.get(URL, params={"region": "eu"})
    assert resp.status_code == 200
    assert resp.json()["items"][0][0] == 2592
