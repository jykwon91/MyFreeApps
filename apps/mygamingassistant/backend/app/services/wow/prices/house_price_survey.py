"""One item across EVERY Blizzard auction house — the operator's tool for mapping a server.

Blizzard never says which server a house belongs to. To map one, the
operator notes an item's price on that server's auction house in game and
compares it with this list (``python -m app.cli wow-house-prices <item id>``);
the house that matches goes into ``PRICE_SERVER_HOUSES``. Reads every house
in the index, mapped or not; nothing is stored.
"""
from __future__ import annotations

from app.core.config import settings
from app.core.wow_prices import PRICE_SERVER_HOUSES
from app.services.wow.prices.blizzard_auction_client import BlizzardAuctionClient
from app.services.wow.prices.blizzard_price_fetch import read_house_prices
from app.services.wow.prices.house_item_quote import HouseItemQuote
from app.services.wow.prices.price_fetch_error import PriceFetchError


def _server_of(house_id: int) -> str | None:
    return next((server for server, houses in PRICE_SERVER_HOUSES.items() if house_id in houses.values()), None)


async def survey_item(item_id: int) -> list[HouseItemQuote]:
    """The item's figures in every house, by house id.

    Raises PriceFetchError when the token or the index fails; a house that
    can't be read gets its error on its own row.
    """
    quotes: list[HouseItemQuote] = []
    async with BlizzardAuctionClient(settings.blizzard_client_id, settings.blizzard_client_secret) as client:
        for house in sorted(await client.houses(), key=lambda h: h.id):
            server = _server_of(house.id)
            try:
                prices = await read_house_prices(client, house.id)
            except PriceFetchError as exc:
                quotes.append(HouseItemQuote(house.id, house.faction, server, None, exc.summary()))
                continue
            price = next((p for p in prices.prices if p.item_id == item_id), None)
            quotes.append(HouseItemQuote(house.id, house.faction, server, price))
    return quotes
