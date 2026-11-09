"""Read WoW Forever auction-house prices for the public API — one house per request."""
from __future__ import annotations

import hashlib

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_prices import PRICE_REGION, WOW_FOREVER_GAME_SLUG, PriceFaction, PriceServer
from app.repositories.game.game_repo import get_game_by_slug
from app.repositories.wow import item_price_repo, price_feed_repo
from app.schemas.wow.price_list import PRICE_LIST_COLUMNS, WowPriceList
from app.services.wow.prices.client_item_names import client_item_names
from app.services.wow.prices.price_houses import house_id_for
from app.services.wow.prices.served_prices import ServedPrices


def _etag(house_id: int, version: str) -> str:
    return '"' + hashlib.sha256(f"blizzard:{PRICE_REGION}:{house_id}:{version}".encode()).hexdigest()[:32] + '"'


async def served_prices(db: AsyncSession, server: PriceServer, faction: PriceFaction) -> ServedPrices:
    """Every stored US price of the server's house for the faction; an empty list when there are none yet."""
    house_id = house_id_for(server, faction)
    empty = WowPriceList(
        region=PRICE_REGION,
        server=server,
        faction=faction,
        source_updated_at=None,
        fetched_at=None,
        columns=list(PRICE_LIST_COLUMNS),
        items=[],
    )
    game = await get_game_by_slug(db, WOW_FOREVER_GAME_SLUG)
    feed = await price_feed_repo.get(db, game.id, PRICE_REGION, house_id) if game else None
    if feed is None or feed.fetched_at is None:
        return ServedPrices(body=empty, etag=_etag(house_id, "none"))

    rows = await item_price_repo.list_for_feed(db, feed.id)
    names = client_item_names()
    body = empty.model_copy(update={
        "source_updated_at": feed.source_updated_at,
        "fetched_at": feed.fetched_at,
        "items": [
            (r.item_id, r.market_value, r.min_buyout, r.quantity, r.listing_count, names.name_for(r.item_id))
            for r in rows
        ],
    })
    return ServedPrices(body=body, etag=_etag(house_id, f"{feed.fetched_at.isoformat()}:{names.client_build}"))
