"""Read every WoW Forever auction house and pool the listings per faction.

Blizzard lists one house per realm and faction (Alliance / Horde / the
neutral Blackwater house) and doesn't say which realm a house belongs to, so
each faction's houses are pooled into one region-wide set. Houses are read
one at a time (each answer is up to ~10 MB) and folded into the faction's
aggregator as they arrive, so only one house's rows are in memory at once.

A faction is all or nothing: if any of its houses fails, the faction gets
the error and its stored prices stay — a set built from half the houses
would quietly show the wrong cheapest price.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime

from app.core.config import settings
from app.core.wow_prices import PRICE_FACTIONS
from app.services.wow.prices.auction_aggregator import AuctionAggregator
from app.services.wow.prices.auction_listing import AuctionListing
from app.services.wow.prices.auction_listing_parser import commodity_listing, item_listing
from app.services.wow.prices.blizzard_auction_client import BlizzardAuctionClient
from app.services.wow.prices.faction_prices import FactionPrices
from app.services.wow.prices.house_auctions import HouseAuctions
from app.services.wow.prices.price_fetch_error import PriceFetchError


FactionResults = dict[str, FactionPrices | PriceFetchError]
PriceFetch = Callable[[], Awaitable[FactionResults]]


def _fold(aggregator: AuctionAggregator, answer: HouseAuctions, *, commodities: bool) -> None:
    parse = commodity_listing if commodities else item_listing
    for raw in answer.auctions:
        listing: AuctionListing | None = parse(raw)
        if listing is not None:
            aggregator.add(listing)


async def _faction_prices(client: BlizzardAuctionClient, house_ids: list[int]) -> FactionPrices:
    aggregator = AuctionAggregator()
    snapshots: list[datetime] = []
    for house_id in house_ids:
        for commodities in (True, False):
            answer = await client.house_auctions(house_id, commodities=commodities)
            _fold(aggregator, answer, commodities=commodities)
            if answer.snapshot_at is not None:
                snapshots.append(answer.snapshot_at)
    if not snapshots:
        raise PriceFetchError("no house answer carried a Last-Modified time")
    return FactionPrices(prices=aggregator.prices(), snapshot_at=max(snapshots))


async def fetch_with_client(client: BlizzardAuctionClient) -> FactionResults:
    """Every faction's pooled prices, or the error that stopped it."""
    houses = await client.houses()
    results: FactionResults = {}
    for faction in PRICE_FACTIONS:
        house_ids = [house.id for house in houses if house.faction == faction]
        if not house_ids:
            results[faction] = PriceFetchError(f"Blizzard lists no {faction} auction house")
            continue
        try:
            results[faction] = await _faction_prices(client, house_ids)
        except PriceFetchError as exc:
            results[faction] = exc
    return results


async def fetch_faction_prices() -> FactionResults:
    """Take a token and read every house. Any failure before the houses (no
    credentials, a refused token, the index) is every faction's error."""
    try:
        async with BlizzardAuctionClient(settings.blizzard_client_id, settings.blizzard_client_secret) as client:
            return await fetch_with_client(client)
    except PriceFetchError as exc:
        return {faction: exc for faction in PRICE_FACTIONS}
