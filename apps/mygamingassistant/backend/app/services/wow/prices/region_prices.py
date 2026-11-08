"""The served (US) prices plus the ETag the API sends with them."""
from dataclasses import dataclass

from app.schemas.wow.price_list import WowPriceList


@dataclass(frozen=True)
class RegionPrices:
    body: WowPriceList
    # Changes only when a new set is downloaded — a 304 refresh keeps it.
    etag: str
