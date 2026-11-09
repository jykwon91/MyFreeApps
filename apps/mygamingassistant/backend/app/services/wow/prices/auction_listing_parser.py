"""One Blizzard auction row -> (item, copper per unit, units), or None when it has no buyout.

Commodities (stackables, ``.../auctions/{house}/commodities``) carry
``unit_price``; other items (``.../auctions/{house}``) carry ``buyout`` for the
whole listing, so the unit price is buyout / quantity. A bid-only listing (no
buyout) or a row without a usable item id or quantity is skipped — never
guessed.
"""
from typing import Any

from app.services.wow.prices.auction_listing import AuctionListing


def _positive_int(value: Any) -> int | None:
    # bool is an int subclass; a JSON true is never a count or a price.
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def _item_and_quantity(raw: dict[str, Any]) -> tuple[int, int] | None:
    item = raw.get("item")
    item_id = _positive_int(item.get("id")) if isinstance(item, dict) else None
    quantity = _positive_int(raw.get("quantity"))
    if item_id is None or quantity is None:
        return None
    return item_id, quantity


def commodity_listing(raw: dict[str, Any]) -> AuctionListing | None:
    parts = _item_and_quantity(raw)
    unit_price = _positive_int(raw.get("unit_price"))
    if parts is None or unit_price is None:
        return None
    return AuctionListing(item_id=parts[0], unit_price=unit_price, quantity=parts[1])


def item_listing(raw: dict[str, Any]) -> AuctionListing | None:
    parts = _item_and_quantity(raw)
    buyout = _positive_int(raw.get("buyout"))
    if parts is None or buyout is None:
        return None
    item_id, quantity = parts
    return AuctionListing(item_id=item_id, unit_price=max(1, round(buyout / quantity)), quantity=quantity)
