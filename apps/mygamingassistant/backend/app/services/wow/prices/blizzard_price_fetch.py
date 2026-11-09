"""Read each mapped WoW Forever auction house, one price set per house.

Every Blizzard house is its own server market, so houses are never pooled:
each mapped house (``PRICE_SERVER_HOUSES``) gets its own aggregator over its
commodities and item listings. A house is read one answer at a time (each is
up to ~10 MB) and folded as it arrives, so only one answer's rows are in
memory at once.

A house is all or nothing: if either of its answers fails, the house gets
the error and its stored prices stay. A mapped house the index no longer
lists, or lists under another faction, is refused — the mapping is wrong or
Blizzard renumbered the houses, and serving it would show another market.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime

from app.core.config import settings
from app.services.wow.prices.auction_aggregator import AuctionAggregator
from app.services.wow.prices.auction_listing import AuctionListing
from app.services.wow.prices.auction_listing_parser import commodity_listing, item_listing
from app.services.wow.prices.blizzard_auction_client import BlizzardAuctionClient
from app.services.wow.prices.house_auctions import HouseAuctions
from app.services.wow.prices.house_prices import HousePrices
from app.services.wow.prices.mapped_house import MappedHouse
from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.price_houses import mapped_houses

# House id -> its prices, or the error that stopped it.
HouseResults = dict[int, HousePrices | PriceFetchError]
PriceFetch = Callable[[], Awaitable[HouseResults]]


def _fold(aggregator: AuctionAggregator, answer: HouseAuctions, *, commodities: bool) -> None:
    parse = commodity_listing if commodities else item_listing
    for raw in answer.auctions:
        listing: AuctionListing | None = parse(raw)
        if listing is not None:
            aggregator.add(listing)


async def read_house_prices(client: BlizzardAuctionClient, house_id: int) -> HousePrices:
    """One house's prices over its commodities and item listings."""
    aggregator = AuctionAggregator()
    snapshot_at: datetime | None = None
    for commodities in (True, False):
        answer = await client.house_auctions(house_id, commodities=commodities)
        _fold(aggregator, answer, commodities=commodities)
        if answer.snapshot_at is not None and (snapshot_at is None or answer.snapshot_at > snapshot_at):
            snapshot_at = answer.snapshot_at
    if snapshot_at is None:
        raise PriceFetchError(f"house {house_id}: no answer carried a Last-Modified time")
    return HousePrices(prices=aggregator.prices(), snapshot_at=snapshot_at)


async def fetch_with_client(client: BlizzardAuctionClient, houses: list[MappedHouse]) -> HouseResults:
    """Each mapped house's prices, or the error that stopped it."""
    listed = {house.id: house.faction for house in await client.houses()}
    results: HouseResults = {}
    for house in houses:
        listed_faction = listed.get(house.house_id)
        if listed_faction != house.faction:
            results[house.house_id] = PriceFetchError(
                f"house {house.house_id} is mapped as {house.server} {house.faction} but Blizzard's index "
                f"lists it as {listed_faction or 'missing'}",
            )
            continue
        try:
            results[house.house_id] = await read_house_prices(client, house.house_id)
        except PriceFetchError as exc:
            results[house.house_id] = exc
    return results


async def fetch_house_prices() -> HouseResults:
    """Take a token and read every mapped house. Any failure before the houses
    (no credentials, a refused token, the index) is every house's error."""
    houses = mapped_houses()
    try:
        async with BlizzardAuctionClient(settings.blizzard_client_id, settings.blizzard_client_secret) as client:
            return await fetch_with_client(client, houses)
    except PriceFetchError as exc:
        return {house.house_id: exc for house in houses}
