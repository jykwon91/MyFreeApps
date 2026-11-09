"""``GET /api/wow/prices?faction=`` — one faction's US auction-house prices.

Columnar to keep it small: ``columns`` names the positions of each ``items``
row, like the generated gold-farm JSON. Prices are copper per unit, pooled
over every house of the faction:

* ``market_value`` — the price to show: the unit price below which the
  cheapest 10% of the listed units sit (one troll listing can't move it);
* ``min_buyout`` — the cheapest unit on sale;
* ``quantity`` / ``listings`` — units and auctions on sale.

No items means no prices yet — never that everything is free.
"""
from datetime import datetime
from typing import Final

from pydantic import BaseModel

from app.core.wow_prices import PriceFaction

PRICE_LIST_COLUMNS: Final = ("item_id", "market_value", "min_buyout", "quantity", "listings", "name")

PriceRow = tuple[int, int, int, int, int, str]


class WowPriceList(BaseModel):
    # Always "us" — the one region prices are kept for.
    region: str
    faction: PriceFaction
    # Blizzard's newest house snapshot behind these prices ("updated 1 hour ago"). None = no prices yet.
    source_updated_at: datetime | None
    # When we last stored a new set.
    fetched_at: datetime | None
    columns: list[str]
    items: list[PriceRow]
