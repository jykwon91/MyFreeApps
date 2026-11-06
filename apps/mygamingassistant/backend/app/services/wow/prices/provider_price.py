"""One item's price as a price provider reports it, before it's stored."""
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class ProviderPrice:
    item_id: int
    name: str
    # Copper. ``market_value`` is always there; the rest are None when the
    # source has nothing for them.
    market_value: int
    historical: int | None
    avg_sale_price: int | None
    sale_rate: float | None
    sold_per_day: float | None
    # When the source computed this price.
    source_updated_at: datetime
