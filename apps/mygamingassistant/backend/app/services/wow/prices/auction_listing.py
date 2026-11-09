"""One auction listing reduced to what prices need: the item, copper per unit and units."""
from dataclasses import dataclass


@dataclass(frozen=True)
class AuctionListing:
    item_id: int
    unit_price: int
    quantity: int
