"""AuctionItemPrice -> ``wow_item_price`` row values."""
import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from app.services.wow.prices.auction_item_price import AuctionItemPrice


def to_price_rows(feed_id: uuid.UUID, prices: Sequence[AuctionItemPrice], fetched_at: datetime) -> list[dict[str, Any]]:
    return [
        {
            "feed_id": feed_id,
            "item_id": p.item_id,
            "market_value": p.market_value,
            "min_buyout": p.min_buyout,
            "quantity": p.quantity,
            "listing_count": p.listing_count,
            "fetched_at": fetched_at,
            "updated_at": fetched_at,
        }
        for p in prices
    ]
