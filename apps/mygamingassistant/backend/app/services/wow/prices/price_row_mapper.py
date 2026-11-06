"""ProviderPrice -> ``wow_item_price`` row values."""
import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from app.services.wow.prices.provider_price import ProviderPrice


def to_price_rows(feed_id: uuid.UUID, prices: Sequence[ProviderPrice], fetched_at: datetime) -> list[dict[str, Any]]:
    return [
        {
            "feed_id": feed_id,
            "item_id": p.item_id,
            "name": p.name,
            "market_value": p.market_value,
            "historical": p.historical,
            "avg_sale_price": p.avg_sale_price,
            "sale_rate": p.sale_rate,
            "sold_per_day": p.sold_per_day,
            "source_updated_at": p.source_updated_at,
            "fetched_at": fetched_at,
            "updated_at": fetched_at,
        }
        for p in prices
    ]
