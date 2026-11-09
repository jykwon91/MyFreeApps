"""Fold auction listings into per-item figures, one listing at a time.

A faction's houses list ~500k auctions between them. They're folded as they
arrive — per item, units listed at each unit price plus a listing count — so
no house's rows are kept once read and nothing raw reaches the database.
"""
from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Mapping

from app.core.wow_prices import MARKET_VALUE_QUANTILE
from app.services.wow.prices.auction_item_price import AuctionItemPrice
from app.services.wow.prices.auction_listing import AuctionListing


def market_value(units_at_price: Mapping[int, int]) -> int:
    """The unit price below which ``MARKET_VALUE_QUANTILE`` of the listed units sit.

    Weighted by units, so one cheap troll unit among a hundred real ones (or one
    absurd high listing) leaves it where the market is. With only a few units
    listed it is the cheapest — there's nothing else to go on.
    """
    total = sum(units_at_price.values())
    if total <= 0:
        raise ValueError("market_value needs at least one listed unit")
    target = max(1, math.ceil(total * MARKET_VALUE_QUANTILE))
    seen = 0
    for price in sorted(units_at_price):
        seen += units_at_price[price]
        if seen >= target:
            return price
    raise AssertionError("unreachable: the running total reaches the target")


class AuctionAggregator:
    def __init__(self) -> None:
        self._units: defaultdict[int, defaultdict[int, int]] = defaultdict(lambda: defaultdict(int))
        self._listings: defaultdict[int, int] = defaultdict(int)

    def add(self, listing: AuctionListing) -> None:
        self._units[listing.item_id][listing.unit_price] += listing.quantity
        self._listings[listing.item_id] += 1

    def prices(self) -> list[AuctionItemPrice]:
        """One row per item listed, by item id."""
        return [
            AuctionItemPrice(
                item_id=item_id,
                market_value=market_value(units),
                min_buyout=min(units),
                quantity=sum(units.values()),
                listing_count=self._listings[item_id],
            )
            for item_id, units in sorted(self._units.items())
        ]
