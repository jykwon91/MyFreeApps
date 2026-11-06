"""``GET /api/wow/prices`` — every auction-house price in one region.

Columnar to keep it small (~1,100 items in US today): ``columns`` names the
positions of each ``items`` row, like the generated gold-farm JSON. Prices are
copper; a None cell means the source has no value for it. No items means the
source has no prices for this region yet — never that everything is free.
"""
from datetime import datetime
from typing import Final

from pydantic import BaseModel

from app.schemas.wow.price_credit import WowPriceCredit

PRICE_LIST_COLUMNS: Final = ("item_id", "market_value", "avg_sale_price", "historical", "sold_per_day", "name")

PriceRow = tuple[int, int, int | None, int | None, float | None, str]


class WowPriceList(BaseModel):
    region: str
    credit: WowPriceCredit
    # When the source computed these prices ("updated 3 hours ago"). None = no prices yet.
    source_updated_at: datetime | None
    # When we last downloaded a new set.
    fetched_at: datetime | None
    columns: list[str]
    items: list[PriceRow]
