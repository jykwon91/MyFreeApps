"""On-demand price refresh ("Refresh now" on the Auction house page).

``claim`` decides, with one atomic UPDATE of the house's ``checked_at``, whether this request may
refresh the house: not if it was asked for within ``PRICE_REFRESH_COOLDOWN`` (by the scheduler, a
failed try or another click), and not while a scheduled refresh already holds the game's lock
(that one lands on its own and costs no cooldown). The same UPDATE records the click on the feed.

The API never downloads Blizzard's auction data (tens of MB per house; the API process was OOM-killed
doing it): ``hand_to_scheduler`` asks the scheduler process to run the click, and the scheduler's
``run_requested`` job refreshes each clicked house (``run``). So the click returns at once and the page
watches ``state`` for the result.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scheduler_constants import JOB_RUN_PRICE_REFRESH_REQUESTS
from app.core.wow_prices import (
    PRICE_REFRESH_COOLDOWN,
    PRICE_REGION,
    WOW_FOREVER_GAME_SLUG,
    PriceFaction,
    PriceServer,
)
from app.db.session import unit_of_work
from app.models.wow.price_feed import WowPriceFeed
from app.repositories.game.game_repo import get_game_by_slug
from app.repositories.wow import price_feed_repo
from app.schemas.wow.price_refresh_state import WowPriceRefreshState
from app.services.scheduling import scheduler_control_service
from app.services.scheduling.job_not_scheduled_error import JobNotScheduledError
from app.services.scheduling.scheduler_not_running_error import SchedulerNotRunningError
from app.services.wow.prices import price_refresh_service
from app.services.wow.prices.feed_refresh import OUTCOME_FAILED, OUTCOME_LOCKED
from app.services.wow.prices.mapped_house import MappedHouse
from app.services.wow.prices.price_houses import house_id_for, mapped_houses
from app.services.wow.prices.price_refresh_claim import PriceRefreshClaim
from app.services.wow.prices.price_refresh_unavailable_error import PriceRefreshUnavailableError

logger = logging.getLogger(__name__)

_COOLDOWN_SECONDS = int(PRICE_REFRESH_COOLDOWN.total_seconds())
_UNSTORED_OUTCOMES = frozenset({OUTCOME_LOCKED, OUTCOME_FAILED})
_CRASHED_REASON = "The refresh stopped before it saved anything"


def _house(server: PriceServer, faction: PriceFaction) -> MappedHouse:
    return MappedHouse(server=server, faction=faction, house_id=house_id_for(server, faction))


async def claim(server: PriceServer, faction: PriceFaction, *, now: datetime | None = None) -> PriceRefreshClaim | None:
    """Claim a refresh of this server's house for the faction; None when the game isn't seeded."""
    house = _house(server, faction)
    at = now or datetime.now(timezone.utc)
    async with unit_of_work() as db:
        game = await get_game_by_slug(db, WOW_FOREVER_GAME_SLUG)
        if game is None:
            return None
        if await price_feed_repo.refresh_in_progress(db, game.id):
            return PriceRefreshClaim(house=house, status="refreshing", retry_after_seconds=0)
        previous = await price_feed_repo.get_checked_at(db, game.id, PRICE_REGION, house.house_id)
        if await price_feed_repo.claim_refresh(
            db, game.id, PRICE_REGION, house.house_id, house.faction,
            at=at, claimable_before=at - PRICE_REFRESH_COOLDOWN,
        ):
            return PriceRefreshClaim(
                house=house, status="started", retry_after_seconds=_COOLDOWN_SECONDS,
                claimed_at=at, previous_checked_at=previous,
            )
        # Lost: read the stamp that won (a click a moment ago, the scheduler, a failed try).
        winner = await price_feed_repo.get_checked_at(db, game.id, PRICE_REGION, house.house_id)
    checked_at = winner if winner is not None else at
    remaining = (checked_at + PRICE_REFRESH_COOLDOWN - at).total_seconds()
    return PriceRefreshClaim(house=house, status="cooldown", retry_after_seconds=max(math.ceil(remaining), 1))


async def hand_to_scheduler(claim: PriceRefreshClaim) -> None:
    """Ask the scheduler process to carry out a started claim (the claim already recorded the click).

    When the scheduler can't take it (not reporting in, or not refreshing prices) the claim is handed
    back so the click isn't spent, and ``PriceRefreshUnavailableError`` is raised.
    """
    try:
        await scheduler_control_service.request_run(JOB_RUN_PRICE_REFRESH_REQUESTS)
    except (SchedulerNotRunningError, JobNotScheduledError) as exc:
        logger.warning("wow prices: couldn't hand the %s refresh to the scheduler: %s", claim.house.label, exc)
        await _hand_back(claim, reason=None)
        await _clear_request(claim.house.house_id, claim.claimed_at, claim.house.label)
        raise PriceRefreshUnavailableError(str(exc)) from exc


async def run_requested() -> int:
    """The scheduler's side: refresh every house a click is waiting on. Returns how many clicks it dealt with.

    A click whose house was stored since (a scheduled refresh landed first), or that the mapping no
    longer lists, is cleared without a download. A click left by a run a deploy killed is still here,
    so the next run finishes it.
    """
    async with unit_of_work() as db:
        game = await get_game_by_slug(db, WOW_FOREVER_GAME_SLUG)
        if game is None:
            return 0
        feeds = await price_feed_repo.list_requested(db, game.id, PRICE_REGION)
        waiting = [(_claim_of(feed), feed.house_id, feed.refresh_requested_at) for feed in feeds]
    for claim, house_id, requested_at in waiting:
        if claim is None:
            await _clear_request(house_id, requested_at, f"house {house_id}")
        else:
            await run(claim)
    return len(waiting)


def _claim_of(feed: WowPriceFeed) -> PriceRefreshClaim | None:
    """The claim a feed's recorded click stands for; None when there is nothing left to fetch for it."""
    house = next((h for h in mapped_houses() if h.house_id == feed.house_id), None)
    if house is None or feed.checked_at != feed.refresh_requested_at:
        return None
    return PriceRefreshClaim(
        house=house, status="started", retry_after_seconds=_COOLDOWN_SECONDS,
        claimed_at=feed.refresh_requested_at, previous_checked_at=feed.refresh_previous_checked_at,
    )


async def run(claim: PriceRefreshClaim) -> None:
    """Run the refresh a started claim won, then mark its click dealt with. Failures are recorded on the
    feed and logged with Blizzard's status and code by ``price_refresh_service``; nothing is raised.

    A refresh that stored nothing hands the cooldown back so the click isn't spent. One that crashed
    before writing also records why, so the page ends with an answer; one that lost the lock to a
    scheduled run records nothing (that run is still fetching, and its result is the answer). If
    handing the cooldown back fails too, that is logged here, never raised.
    """
    try:
        outcome = await price_refresh_service.refresh_house(claim.house)
        logger.info(
            "wow prices: on-demand refresh of %s: %s (%d items)", outcome.label, outcome.outcome, outcome.item_count,
        )
        if outcome.outcome in _UNSTORED_OUTCOMES:
            await _hand_back(claim, reason=None if outcome.outcome == OUTCOME_LOCKED else _CRASHED_REASON)
    finally:
        await _clear_request(claim.house.house_id, claim.claimed_at, claim.house.label)


async def _hand_back(claim: PriceRefreshClaim, *, reason: str | None) -> None:
    """Give a claim's cooldown back (and record ``reason`` as the house's failure when there is one)."""
    if claim.claimed_at is None:
        return
    try:
        async with unit_of_work() as db:
            game = await get_game_by_slug(db, WOW_FOREVER_GAME_SLUG)
            if game is not None:
                await price_feed_repo.release_claim(
                    db, game.id, PRICE_REGION, claim.house.house_id,
                    claimed_at=claim.claimed_at, restore_to=claim.previous_checked_at,
                    error=reason, error_at=datetime.now(timezone.utc) if reason else None,
                )
    except Exception:
        logger.exception("wow prices: couldn't hand back the cooldown of %s", claim.house.label)


async def _clear_request(house_id: int, requested_at: datetime | None, label: str) -> None:
    """Mark the click stamped ``requested_at`` as dealt with. A failure is logged: the next run tries it again."""
    if requested_at is None:
        return
    try:
        async with unit_of_work() as db:
            game = await get_game_by_slug(db, WOW_FOREVER_GAME_SLUG)
            if game is not None:
                await price_feed_repo.clear_request(db, game.id, PRICE_REGION, house_id, requested_at=requested_at)
    except Exception:
        logger.exception("wow prices: couldn't clear the refresh request of %s", label)


async def state(db: AsyncSession, server: PriceServer, faction: PriceFaction) -> WowPriceRefreshState:
    """What "Refresh now" needs to know about the house: its snapshot, last download, cooldown and last failure."""
    game = await get_game_by_slug(db, WOW_FOREVER_GAME_SLUG)
    feed = await price_feed_repo.get(db, game.id, PRICE_REGION, house_id_for(server, faction)) if game else None
    if feed is None:
        return WowPriceRefreshState(
            source_updated_at=None, fetched_at=None, refresh_available_at=None, refresh_failed_at=None,
        )
    return WowPriceRefreshState(
        source_updated_at=feed.source_updated_at,
        fetched_at=feed.fetched_at,
        refresh_available_at=None if feed.checked_at is None else feed.checked_at + PRICE_REFRESH_COOLDOWN,
        refresh_failed_at=feed.last_error_at if feed.last_error is not None else None,
    )
