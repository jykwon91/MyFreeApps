"""Every item one auction house lists, and when Blizzard took the house's snapshot."""
from dataclasses import dataclass
from datetime import datetime

from app.services.wow.prices.auction_item_price import AuctionItemPrice


@dataclass(frozen=True)
class HousePrices:
    prices: list[AuctionItemPrice]
    snapshot_at: datetime
