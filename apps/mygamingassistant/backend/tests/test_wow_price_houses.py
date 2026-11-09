"""Server -> auction house mapping, and the survey the operator maps a server with.

Covers: every mapped server has one house per faction, no house belongs to
two servers, the PvP houses are the ones verified in game (110 / 113 / 116),
and ``survey_item`` lists the item in every house of the index — mapped or
not — without ever pooling two houses.
"""
from __future__ import annotations

import json

import httpx
import pytest

from app.core.wow_prices import DEFAULT_PRICE_SERVER, PRICE_FACTIONS, PRICE_SERVER_HOUSES, PRICE_SERVERS
from app.services.wow.prices import house_price_survey
from app.services.wow.prices.blizzard_auction_client import BlizzardAuctionClient
from app.services.wow.prices.mapped_house import MappedHouse
from app.services.wow.prices.price_houses import house_id_for, mapped_houses


def test_every_mapped_server_has_one_house_per_faction() -> None:
    assert set(PRICE_SERVER_HOUSES) == set(PRICE_SERVERS)
    assert DEFAULT_PRICE_SERVER in PRICE_SERVERS
    for server, houses in PRICE_SERVER_HOUSES.items():
        assert tuple(houses) == PRICE_FACTIONS, server


def test_no_house_belongs_to_two_servers() -> None:
    ids = [house.house_id for house in mapped_houses()]
    assert len(ids) == len(set(ids))


def test_the_pvp_server_is_the_houses_checked_in_game() -> None:
    assert [house_id_for("pvp", f) for f in PRICE_FACTIONS] == [110, 113, 116]
    assert mapped_houses()[0] == MappedHouse("pvp", "alliance", 110)
    with pytest.raises(KeyError):
        house_id_for("pve", "alliance")


def _answer(body: object) -> httpx.Response:
    return httpx.Response(200, content=json.dumps(body).encode(), headers={"Last-Modified": "Mon, 9 Nov 2026 17:16:22 GMT"})


def _pearls(unit_price: int, quantity: int) -> httpx.Response:
    return _answer({"auctions": [{"id": 1, "item": {"id": 4611}, "quantity": quantity, "unit_price": unit_price}]})


async def test_the_survey_lists_the_item_in_every_house_apart(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = {
        "110/commodities": _pearls(3980, 40),
        "111/commodities": _pearls(3100, 20),
        "112": httpx.Response(503, content=b'{"type": "BLZWEBAPI00000503", "detail": "Service Unavailable"}'),
    }

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.battle.net":
            return _answer({"access_token": "tok", "token_type": "bearer", "expires_in": 86399})
        path = request.url.path.removeprefix("/data/wow/ruleset/1/auctions/")
        if path == "":
            return _answer({"auctions": [
                {"id": 113, "name": "Horde Auction House"},
                {"id": 110, "name": "Alliance Auction House"},
                {"id": 111, "name": "Alliance Auction House"},
                {"id": 112, "name": "Alliance Auction House"},
            ]})
        return answers.get(path, _answer({"auctions": []}))

    def fake_client(client_id: str, client_secret: str) -> BlizzardAuctionClient:
        return BlizzardAuctionClient("id", "secret", transport=httpx.MockTransport(handle))

    monkeypatch.setattr(house_price_survey, "BlizzardAuctionClient", fake_client)
    quotes = await house_price_survey.survey_item(4611)

    assert [(q.house_id, q.faction, q.server) for q in quotes] == [
        (110, "alliance", "pvp"), (111, "alliance", None), (112, "alliance", None), (113, "horde", "pvp"),
    ]
    assert (quotes[0].price.min_buyout, quotes[0].price.quantity) == (3980, 40)
    assert (quotes[1].price.min_buyout, quotes[1].price.quantity) == (3100, 20)
    assert quotes[2].price is None and "BLZWEBAPI00000503" in (quotes[2].error or "")
    assert quotes[3].price is None and quotes[3].error is None
