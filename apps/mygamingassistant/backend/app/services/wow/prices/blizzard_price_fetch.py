"""Read each mapped WoW Forever auction house, one price set per house.

Every Blizzard house is its own server market, so houses are never pooled:
each mapped house (``PRICE_SERVER_HOUSES``) gets its own aggregator over its
commodities and item listings. A house is read one answer at a time and each
answer is streamed: its rows are folded as they arrive, so no listing list is
ever in memory.

A house is all or nothing: if either of its answers fails, the house gets
the error and its stored prices stay. A mapped house the index no longer
lists, or lists under another faction, is refused — the mapping is wrong or
Blizzard renumbered the houses, and serving it would show another market.
"""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime

from app.core.config import settings
from app.services.wow.prices.auction_aggregator import AuctionAggregator
from app.services.wow.prices.auction_listing import AuctionListing
from app.services.wow.prices.auction_listing_parser import commodity_listing, item_listing
from app.services.wow.prices.blizzard_auction_client import BlizzardAuctionClient
from app.services.wow.prices.house_prices import HousePrices
from app.services.wow.prices.mapped_house import MappedHouse
from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.price_houses import mapped_houses


@dataclass(frozen=True)
class HouseNotModified:
    """Blizzard confirmed the house's prices have not changed since ``source_updated_at``."""
    house_id: int


# House id -> its prices, the error that stopped it, or a not-modified confirmation.
HouseResults = dict[int, HousePrices | PriceFetchError | HouseNotModified]
# ``**kwargs`` allows callers to pass ``if_modified_since`` without breaking test stubs.
PriceFetch = Callable[..., Awaitable[HouseResults]]


async def read_house_prices(
    client: BlizzardAuctionClient,
    house_id: int,
    *,
    if_modified_since: datetime | None = None,
) -> HousePrices | HouseNotModified:
    """One house's prices over its item and commodity listings.

    Checks the item-listings endpoint first so a 304 (``if_modified_since`` set and data unchanged)
    short-circuits before the commodities download. Each answer is folded row by row as it streams in.
    """
    aggregator = AuctionAggregator()
    snapshot_at: datetime | None = None
    # Items first: a 304 on items means the full snapshot is unchanged — skip commodities too.
    for commodities in (False, True):
        parse = commodity_listing if commodities else item_listing
        async with client.house_auctions(
            house_id, commodities=commodities,
            if_modified_since=if_modified_since if not commodities else None,
        ) as answer:
            if answer.not_modified:
                return HouseNotModified(house_id=house_id)
            async for raw in answer.auctions:
                listing: AuctionListing | None = parse(raw)
                if listing is not None:
                    aggregator.add(listing)
        if answer.snapshot_at is not None and (snapshot_at is None or answer.snapshot_at > snapshot_at):
            snapshot_at = answer.snapshot_at
    if snapshot_at is None:
        raise PriceFetchError(f"house {house_id}: no answer carried a Last-Modified time")
    return HousePrices(prices=await asyncio.to_thread(aggregator.prices), snapshot_at=snapshot_at)


async def fetch_with_client(
    client: BlizzardAuctionClient,
    houses: list[MappedHouse],
    *,
    if_modified_since: dict[int, datetime] | None = None,
) -> HouseResults:
    """Each mapped house's prices, a not-modified confirmation, or the error that stopped it."""
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
            since = (if_modified_since or {}).get(house.house_id)
            results[house.house_id] = await read_house_prices(client, house.house_id, if_modified_since=since)
        except PriceFetchError as exc:
            results[house.house_id] = exc
    return results


async def fetch_house_prices(
    houses: list[MappedHouse] | None = None,
    *,
    if_modified_since: dict[int, datetime] | None = None,
) -> HouseResults:
    """Take a token and read the given houses (default: every mapped house). Any failure before
    the houses (no credentials, a refused token, the index) is every house's error."""
    houses = mapped_houses() if houses is None else houses
    try:
        async with BlizzardAuctionClient(settings.blizzard_client_id, settings.blizzard_client_secret) as client:
            return await fetch_with_client(client, houses, if_modified_since=if_modified_since)
    except PriceFetchError as exc:
        return {house.house_id: exc for house in houses}
