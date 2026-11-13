"""Refresh now on the Auction house page: POST/GET /api/wow/prices/refresh and the claim behind it.

A claim is one atomic UPDATE of the house's ``checked_at``, so the cooldown counts the scheduler's
runs, failed tries and other clicks alike; the refresh itself runs after the response, for that one
house, under the same game lock as the scheduled refresh.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api import wow_prices
from app.core.config import settings
from app.core.wow_prices import (
    PRICE_REFRESH_COOLDOWN,
    PRICE_REFRESH_RATE_LIMIT,
    PRICE_REFRESH_STATE_RATE_LIMIT,
    PRICE_SERVER_HOUSES,
    WOW_FOREVER_GAME_SLUG,
)
from app.models.game.game import Game
from app.models.wow.price_feed import WowPriceFeed
from app.repositories.game.game_repo import get_game_by_slug
from app.repositories.wow import price_feed_repo
from app.services.wow.prices import price_refresh_now_service, price_refresh_service
from app.services.wow.prices.auction_item_price import AuctionItemPrice
from app.services.wow.prices.blizzard_price_fetch import HouseResults
from app.services.wow.prices.feed_refresh import OUTCOME_FAILED, OUTCOME_LOCKED, OUTCOME_UPDATED
from app.services.wow.prices.house_prices import HousePrices
from app.services.wow.prices.mapped_house import MappedHouse
from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.price_refresh_claim import PriceRefreshClaim

URL = "/api/wow/prices/refresh"
PVP = PRICE_SERVER_HOUSES["pvp"]
ALLIANCE = MappedHouse(server="pvp", faction="alliance", house_id=PVP["alliance"])
HORDE = MappedHouse(server="pvp", faction="horde", house_id=PVP["horde"])
COOLDOWN_SECONDS = int(PRICE_REFRESH_COOLDOWN.total_seconds())
# The route stamps the real clock, so the route tests store their times relative to it.
ROUTE_NOW = datetime.now(timezone.utc)
NOW = datetime(2026, 11, 13, 18, 0, tzinfo=timezone.utc)
SNAPSHOT = datetime(2026, 11, 13, 17, 5, tzinfo=timezone.utc)
NEWER_SNAPSHOT = SNAPSHOT + timedelta(hours=1)
LINEN = AuctionItemPrice(item_id=2589, market_value=28, min_buyout=24, quantity=100, listing_count=9)


def _set(snapshot: datetime = SNAPSHOT) -> HousePrices:
    return HousePrices(prices=[LINEN], snapshot_at=snapshot)


class FakeBlizzard:
    """A stand-in for the one-house Blizzard fetch: the result it is scripted with, for the house asked."""

    def __init__(self, house: MappedHouse, result: HousePrices | PriceFetchError) -> None:
        self._house = house
        self.result = result
        self.calls = 0

    async def __call__(self, houses: list[MappedHouse] | None = None) -> HouseResults:
        self.calls += 1
        return {self._house.house_id: self.result}


@pytest.fixture(autouse=True)
def _reset_limiters() -> None:
    wow_prices.price_refresh_limiter._buckets.clear()
    wow_prices.price_refresh_state_limiter._buckets.clear()


@pytest.fixture(autouse=True)
def _refreshes_switched_on(monkeypatch: pytest.MonkeyPatch) -> None:
    """CI runs with WOW_PRICE_REFRESH_ENABLED=false; these tests are about the switched-on route (the switched-off test sets it back)."""
    monkeypatch.setattr(settings, "wow_price_refresh_enabled", True)


@pytest.fixture
def ran(monkeypatch: pytest.MonkeyPatch) -> list[PriceRefreshClaim]:
    """The claims the route handed to the background refresh (which is not run here)."""
    claims: list[PriceRefreshClaim] = []

    async def record(claim: PriceRefreshClaim) -> None:
        claims.append(claim)

    monkeypatch.setattr(price_refresh_now_service, "run", record)
    return claims


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


async def _feed(db: AsyncSession, game: Game, house: MappedHouse = ALLIANCE) -> WowPriceFeed:
    feed = await price_feed_repo.get(db, game.id, "us", house.house_id)
    assert feed is not None
    await db.refresh(feed)
    return feed


async def _asked_for(db: AsyncSession, game: Game, at: datetime, house: MappedHouse = ALLIANCE) -> None:
    feed = await price_feed_repo.get_or_create(db, game.id, "us", house.house_id, house.faction)
    price_feed_repo.update(feed, {"checked_at": at})
    await price_feed_repo.flush(db)


# --- the claim ------------------------------------------------------------------


async def test_a_house_nobody_has_asked_for_can_be_claimed(bound_unit_of_work: AsyncSession, wow_game: Game) -> None:
    claim = await price_refresh_now_service.claim("pvp", "alliance", now=NOW)

    assert claim is not None and claim.status == "started" and claim.house == ALLIANCE
    assert claim.retry_after_seconds == COOLDOWN_SECONDS
    assert (await _feed(bound_unit_of_work, wow_game)).checked_at == NOW


async def test_a_second_claim_inside_the_cooldown_is_refused_with_the_time_left(
    bound_unit_of_work: AsyncSession, wow_game: Game,
) -> None:
    assert (await price_refresh_now_service.claim("pvp", "alliance", now=NOW)) is not None

    refused = await price_refresh_now_service.claim("pvp", "alliance", now=NOW + timedelta(seconds=90))

    assert refused is not None and refused.status == "cooldown"
    assert refused.retry_after_seconds == COOLDOWN_SECONDS - 90
    again = await price_refresh_now_service.claim("pvp", "alliance", now=NOW + PRICE_REFRESH_COOLDOWN)
    assert again is not None and again.status == "started"


async def test_the_schedulers_last_run_counts_toward_the_cooldown(
    bound_unit_of_work: AsyncSession, wow_game: Game,
) -> None:
    await price_refresh_service.store_house(
        bound_unit_of_work, wow_game.id, ALLIANCE, _set(), NOW - timedelta(minutes=2),
    )

    refused = await price_refresh_now_service.claim("pvp", "alliance", now=NOW)

    assert refused is not None and refused.status == "cooldown"
    assert refused.retry_after_seconds == COOLDOWN_SECONDS - 120


async def test_a_failed_try_counts_toward_the_cooldown(bound_unit_of_work: AsyncSession, wow_game: Game) -> None:
    error = PriceFetchError("Service Unavailable", status_code=503, code="BLZWEBAPI00000503")
    await price_refresh_service.store_house(
        bound_unit_of_work, wow_game.id, ALLIANCE, error, NOW - timedelta(minutes=4),
    )

    refused = await price_refresh_now_service.claim("pvp", "alliance", now=NOW)

    assert refused is not None and refused.status == "cooldown"
    assert refused.retry_after_seconds == COOLDOWN_SECONDS - 240


async def test_each_house_has_its_own_cooldown(bound_unit_of_work: AsyncSession, wow_game: Game) -> None:
    first = await price_refresh_now_service.claim("pvp", "alliance", now=NOW)
    assert first is not None and first.status == "started"

    other = await price_refresh_now_service.claim("pvp", "horde", now=NOW)

    assert other is not None and other.status == "started" and other.house == HORDE


async def test_a_claim_while_a_refresh_holds_the_lock_costs_no_cooldown(
    bound_unit_of_work: AsyncSession, db_engine, wow_game: Game,
) -> None:
    other_worker = async_sessionmaker(bind=db_engine)
    async with other_worker() as other, other.begin():
        assert await price_feed_repo.try_refresh_lock(other, wow_game.id)

        busy = await price_refresh_now_service.claim("pvp", "alliance", now=NOW)

    assert busy is not None and busy.status == "refreshing" and busy.retry_after_seconds == 0
    # Nothing was stamped, so the click that follows the scheduled run can still start.
    again = await price_refresh_now_service.claim("pvp", "alliance", now=NOW)
    assert again is not None and again.status == "started"


async def test_a_started_claim_remembers_the_stamp_it_replaced(
    bound_unit_of_work: AsyncSession, wow_game: Game,
) -> None:
    before = NOW - timedelta(hours=2)
    await _asked_for(bound_unit_of_work, wow_game, before)

    claim = await price_refresh_now_service.claim("pvp", "alliance", now=NOW)

    assert claim is not None and claim.claimed_at == NOW and claim.previous_checked_at == before


async def test_a_refresh_that_loses_the_lock_hands_the_cooldown_back_without_calling_it_a_failure(
    bound_unit_of_work: AsyncSession, db_engine, wow_game: Game,
) -> None:
    before = NOW - timedelta(hours=2)
    await _asked_for(bound_unit_of_work, wow_game, before)
    claim = await price_refresh_now_service.claim("pvp", "alliance", now=NOW)
    assert claim is not None and claim.status == "started"

    # Between the claim's peek and the refresh, a scheduled run takes the game's lock.
    other_worker = async_sessionmaker(bind=db_engine)
    async with other_worker() as other, other.begin():
        assert await price_feed_repo.try_refresh_lock(other, wow_game.id)
        await price_refresh_now_service.run(claim)

    feed = await _feed(bound_unit_of_work, wow_game)
    # Handed back, but not a failure: the scheduled run is still fetching and its result is the answer.
    assert feed.checked_at == before
    assert feed.last_error is None and feed.last_error_at is None
    state = await price_refresh_now_service.state(bound_unit_of_work, "pvp", "alliance")
    assert state.refresh_failed_at is None
    again = await price_refresh_now_service.claim("pvp", "alliance", now=NOW + timedelta(minutes=1))
    assert again is not None and again.status == "started"


async def test_a_refresh_that_crashes_before_storing_hands_the_cooldown_back_and_says_so(
    bound_unit_of_work: AsyncSession, wow_game: Game, monkeypatch: pytest.MonkeyPatch,
) -> None:
    claim = await price_refresh_now_service.claim("pvp", "alliance", now=NOW)
    assert claim is not None and claim.status == "started"

    async def crash(houses: list[MappedHouse] | None = None) -> HouseResults:
        raise RuntimeError("connection reset")

    monkeypatch.setattr(price_refresh_service, "fetch_house_prices", crash)

    await price_refresh_now_service.run(claim)

    feed = await _feed(bound_unit_of_work, wow_game)
    assert feed.checked_at is None and feed.last_error is not None and feed.last_error_at is not None


async def test_a_refresh_that_stored_its_failure_keeps_its_own_cooldown(
    bound_unit_of_work: AsyncSession, wow_game: Game, monkeypatch: pytest.MonkeyPatch,
) -> None:
    claim = await price_refresh_now_service.claim("pvp", "alliance", now=NOW)
    assert claim is not None

    async def blizzard_down(houses: list[MappedHouse] | None = None) -> HouseResults:
        return {ALLIANCE.house_id: PriceFetchError("Service Unavailable", status_code=503, code="BLZWEBAPI00000503")}

    monkeypatch.setattr(price_refresh_service, "fetch_house_prices", blizzard_down)

    await price_refresh_now_service.run(claim)

    feed = await _feed(bound_unit_of_work, wow_game)
    assert feed.checked_at is not None and feed.checked_at != claim.previous_checked_at
    assert feed.last_error is not None and "503" in feed.last_error


async def test_a_failure_to_hand_the_cooldown_back_is_logged_not_raised(
    bound_unit_of_work: AsyncSession, wow_game: Game, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    claim = await price_refresh_now_service.claim("pvp", "alliance", now=NOW)
    assert claim is not None

    async def crash(houses: list[MappedHouse] | None = None) -> HouseResults:
        raise RuntimeError("connection reset")

    async def release_fails(*args: object, **kwargs: object) -> bool:
        raise RuntimeError("database went away")

    monkeypatch.setattr(price_refresh_service, "fetch_house_prices", crash)
    monkeypatch.setattr(price_feed_repo, "release_claim", release_fails)

    await price_refresh_now_service.run(claim)

    assert "couldn't hand back the cooldown" in caplog.text


async def test_release_claim_without_an_error_only_restores_the_stamp(
    bound_unit_of_work: AsyncSession, wow_game: Game,
) -> None:
    await _asked_for(bound_unit_of_work, wow_game, NOW)

    released = await price_feed_repo.release_claim(
        bound_unit_of_work, wow_game.id, "us", ALLIANCE.house_id, claimed_at=NOW, restore_to=None,
    )

    feed = await _feed(bound_unit_of_work, wow_game)
    assert released and feed.checked_at is None and feed.last_error is None


async def test_release_claim_never_undoes_a_later_stamp(bound_unit_of_work: AsyncSession, wow_game: Game) -> None:
    await _asked_for(bound_unit_of_work, wow_game, NOW + timedelta(minutes=3))

    released = await price_feed_repo.release_claim(
        bound_unit_of_work, wow_game.id, "us", ALLIANCE.house_id,
        claimed_at=NOW, restore_to=None, error="x", error_at=NOW,
    )

    assert released is False
    assert (await _feed(bound_unit_of_work, wow_game)).checked_at == NOW + timedelta(minutes=3)


async def test_a_house_that_lists_nothing_and_has_no_prices_still_moves_fetched_at(
    bound_unit_of_work: AsyncSession, wow_game: Game,
) -> None:
    await price_refresh_service.store_house(
        bound_unit_of_work, wow_game.id, ALLIANCE, HousePrices(prices=[], snapshot_at=SNAPSHOT), NOW,
    )

    state = await price_refresh_now_service.state(bound_unit_of_work, "pvp", "alliance")

    assert state.fetched_at == NOW and state.refresh_failed_at is None


async def test_no_game_cannot_be_claimed(bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    async def no_game(db: AsyncSession, slug: str) -> None:
        return None

    monkeypatch.setattr(price_refresh_now_service, "get_game_by_slug", no_game)
    assert await price_refresh_now_service.claim("pvp", "alliance", now=NOW) is None


# --- the refresh ------------------------------------------------------------------


async def test_a_refresh_reads_and_stores_only_the_house_asked_for(
    bound_unit_of_work: AsyncSession, wow_game: Game,
) -> None:
    fetch = FakeBlizzard(HORDE, _set())

    outcome = await price_refresh_service.refresh_house(HORDE, fetch, now=NOW)

    assert outcome.outcome == OUTCOME_UPDATED and outcome.item_count == 1 and fetch.calls == 1
    horde = await _feed(bound_unit_of_work, wow_game, HORDE)
    assert horde.source_updated_at == SNAPSHOT and horde.fetched_at == NOW
    assert await price_feed_repo.get(bound_unit_of_work, wow_game.id, "us", ALLIANCE.house_id) is None


async def test_run_asks_blizzard_for_the_claimed_house_only(
    bound_unit_of_work: AsyncSession, wow_game: Game, monkeypatch: pytest.MonkeyPatch,
) -> None:
    asked: list[list[MappedHouse] | None] = []

    async def fake_fetch(houses: list[MappedHouse] | None = None) -> HouseResults:
        asked.append(houses)
        return {ALLIANCE.house_id: _set()}

    monkeypatch.setattr(price_refresh_service, "fetch_house_prices", fake_fetch)

    await price_refresh_now_service.run(PriceRefreshClaim(house=ALLIANCE, status="started", retry_after_seconds=1))

    assert asked == [[ALLIANCE]]
    assert (await _feed(bound_unit_of_work, wow_game)).item_count == 1


async def test_a_refresh_another_worker_is_running_is_skipped_before_fetching(
    bound_unit_of_work: AsyncSession, db_engine, wow_game: Game,
) -> None:
    fetch = FakeBlizzard(ALLIANCE, _set())
    other_worker = async_sessionmaker(bind=db_engine)
    async with other_worker() as other, other.begin():
        assert await price_feed_repo.try_refresh_lock(other, wow_game.id)
        outcome = await price_refresh_service.refresh_house(ALLIANCE, fetch, now=NOW)

    assert outcome.outcome == OUTCOME_LOCKED
    assert fetch.calls == 0


async def test_a_blizzard_error_keeps_the_prices_and_logs_its_code(
    bound_unit_of_work: AsyncSession, wow_game: Game, caplog: pytest.LogCaptureFixture,
) -> None:
    await price_refresh_service.refresh_house(ALLIANCE, FakeBlizzard(ALLIANCE, _set()), now=NOW)
    error = PriceFetchError("Service Unavailable", status_code=503, code="BLZWEBAPI00000503")

    outcome = await price_refresh_service.refresh_house(
        ALLIANCE, FakeBlizzard(ALLIANCE, error), now=NOW + timedelta(hours=1),
    )

    assert (outcome.outcome, outcome.item_count) == (OUTCOME_FAILED, 1)
    state = await price_refresh_now_service.state(bound_unit_of_work, "pvp", "alliance")
    assert state.refresh_failed_at == NOW + timedelta(hours=1) and state.fetched_at == NOW
    assert "status=503 code=BLZWEBAPI00000503" in caplog.text


async def test_the_state_tells_a_newer_snapshot_from_the_same_one(
    bound_unit_of_work: AsyncSession, wow_game: Game,
) -> None:
    db = bound_unit_of_work
    await price_refresh_service.refresh_house(ALLIANCE, FakeBlizzard(ALLIANCE, _set()), now=NOW)
    first = await price_refresh_now_service.state(db, "pvp", "alliance")

    await price_refresh_service.refresh_house(ALLIANCE, FakeBlizzard(ALLIANCE, _set()), now=NOW + timedelta(minutes=15))
    same = await price_refresh_now_service.state(db, "pvp", "alliance")
    await price_refresh_service.refresh_house(
        ALLIANCE, FakeBlizzard(ALLIANCE, _set(NEWER_SNAPSHOT)), now=NOW + timedelta(minutes=30),
    )
    newer = await price_refresh_now_service.state(db, "pvp", "alliance")

    # A finished refresh always moves fetched_at; only a newer snapshot moves source_updated_at.
    assert same.fetched_at != first.fetched_at and same.source_updated_at == first.source_updated_at == SNAPSHOT
    assert newer.fetched_at != same.fetched_at and newer.source_updated_at == NEWER_SNAPSHOT


# --- the routes ------------------------------------------------------------------


async def test_the_route_starts_a_refresh_and_answers_before_it_runs(
    client: AsyncClient, db: AsyncSession, wow_game: Game, ran: list[PriceRefreshClaim],
) -> None:
    await _asked_for(db, wow_game, ROUTE_NOW - timedelta(hours=1))

    response = await client.post(URL)

    assert response.status_code == 202
    assert response.json() == {"status": "started", "retry_after_seconds": COOLDOWN_SECONDS}
    assert [claim.house for claim in ran] == [ALLIANCE]


async def test_the_route_refreshes_the_house_it_is_asked_for(
    client: AsyncClient, wow_game: Game, ran: list[PriceRefreshClaim],
) -> None:
    response = await client.post(URL, params={"server": "pvp", "faction": "neutral"})

    assert response.status_code == 202
    assert [claim.house.faction for claim in ran] == ["neutral"]


async def test_the_route_inside_the_cooldown_runs_nothing_and_says_when_to_come_back(
    client: AsyncClient, db: AsyncSession, wow_game: Game, ran: list[PriceRefreshClaim],
) -> None:
    await _asked_for(db, wow_game, datetime.now(timezone.utc) - timedelta(seconds=30))

    response = await client.post(URL)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cooldown" and 0 < body["retry_after_seconds"] <= COOLDOWN_SECONDS
    assert ran == []


async def test_two_clicks_start_one_refresh(client: AsyncClient, wow_game: Game, ran: list[PriceRefreshClaim]) -> None:
    statuses = [(await client.post(URL)).json()["status"] for _ in range(2)]

    assert statuses == ["started", "cooldown"]
    assert len(ran) == 1


async def test_the_route_says_refreshing_while_a_scheduled_refresh_runs(
    client: AsyncClient, db_engine, wow_game: Game, ran: list[PriceRefreshClaim],
) -> None:
    other_worker = async_sessionmaker(bind=db_engine)
    async with other_worker() as other, other.begin():
        assert await price_feed_repo.try_refresh_lock(other, wow_game.id)
        response = await client.post(URL)

    assert response.status_code == 200
    assert response.json() == {"status": "refreshing", "retry_after_seconds": 0}
    assert ran == []


@pytest.mark.parametrize("params", [{"faction": "goblin"}, {"server": "pve"}])
async def test_the_route_rejects_an_unknown_faction_or_unmapped_server(
    params: dict[str, str], client: AsyncClient, wow_game: Game, ran: list[PriceRefreshClaim],
) -> None:
    assert (await client.post(URL, params=params)).status_code == 422
    assert ran == []


async def test_the_route_is_limited_per_ip(client: AsyncClient, wow_game: Game, ran: list[PriceRefreshClaim]) -> None:
    codes = [(await client.post(URL)).status_code for _ in range(PRICE_REFRESH_RATE_LIMIT + 1)]

    assert codes[-1] == 429
    assert 429 not in codes[:-1]


async def test_the_route_is_a_503_when_price_refreshes_are_switched_off(
    client: AsyncClient, wow_game: Game, ran: list[PriceRefreshClaim], monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "wow_price_refresh_enabled", False)

    response = await client.post(URL)

    assert response.status_code == 503 and response.json()["detail"] == "price_refresh_disabled"
    assert ran == []


async def test_the_route_is_public_in_serve_only(
    serve_only_client: AsyncClient, wow_game: Game, ran: list[PriceRefreshClaim],
) -> None:
    assert (await serve_only_client.post(URL)).status_code == 202


async def test_the_state_route_says_when_it_can_be_refreshed_again_and_when_a_refresh_failed(
    client: AsyncClient, wow_game: Game,
) -> None:
    empty = await client.get(URL)
    assert empty.status_code == 200 and empty.headers["cache-control"] == "no-store"
    assert empty.json() == {
        "source_updated_at": None, "fetched_at": None, "refresh_available_at": None, "refresh_failed_at": None,
    }

    await price_refresh_service.refresh_house(ALLIANCE, FakeBlizzard(ALLIANCE, _set()), now=NOW)
    body = (await client.get(URL)).json()
    assert body["refresh_available_at"] == (NOW + PRICE_REFRESH_COOLDOWN).isoformat().replace("+00:00", "Z")
    assert body["source_updated_at"].startswith("2026-11-13T17:05:00") and body["refresh_failed_at"] is None

    error = PriceFetchError("boom", status_code=500, code="X")
    await price_refresh_service.refresh_house(ALLIANCE, FakeBlizzard(ALLIANCE, error), now=NOW + timedelta(hours=1))
    failed = (await client.get(URL)).json()
    assert failed["refresh_failed_at"].startswith("2026-11-13T19:00:00")
    assert failed["source_updated_at"] == body["source_updated_at"]


async def test_the_state_route_is_limited_per_ip(client: AsyncClient, wow_game: Game) -> None:
    codes = [(await client.get(URL)).status_code for _ in range(PRICE_REFRESH_STATE_RATE_LIMIT + 1)]

    assert codes[-1] == 429
    assert 429 not in codes[:-1]
