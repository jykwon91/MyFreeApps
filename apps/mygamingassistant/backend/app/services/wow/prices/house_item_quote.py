"""One item's figures in one Blizzard auction house, for mapping houses to servers."""
from dataclasses import dataclass

from app.services.wow.prices.auction_item_price import AuctionItemPrice


@dataclass(frozen=True)
class HouseItemQuote:
    house_id: int
    faction: str
    # The server the house is mapped to, or None when unmapped.
    server: str | None
    # None when the house lists none of the item (or couldn't be read).
    price: AuctionItemPrice | None
    # Why the house couldn't be read, if it couldn't.
    error: str | None = None
