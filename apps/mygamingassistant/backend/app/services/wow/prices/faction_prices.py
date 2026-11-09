"""Every item one faction's auction houses list, and when Blizzard took the newest snapshot."""
from dataclasses import dataclass
from datetime import datetime

from app.services.wow.prices.auction_item_price import AuctionItemPrice


@dataclass(frozen=True)
class FactionPrices:
    prices: list[AuctionItemPrice]
    snapshot_at: datetime
