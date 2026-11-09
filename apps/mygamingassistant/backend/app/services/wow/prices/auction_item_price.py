"""One item's figures over every listing of one faction's auction houses, before they're stored."""
from dataclasses import dataclass


@dataclass(frozen=True)
class AuctionItemPrice:
    item_id: int
    # Copper per unit: the low-quantile price every page shows, and the cheapest unit.
    market_value: int
    min_buyout: int
    # Units listed, over ``listing_count`` listings.
    quantity: int
    listing_count: int
