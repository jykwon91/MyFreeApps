"""The Blizzard auction-house client and the per-house fetch, against a fake Blizzard.

Covers: the token request, the house index by name, Last-Modified, Blizzard's
error codes (API ``type`` and OAuth ``error``) captured on the error, network
failures, missing credentials, each mapped house kept apart (never pooled
with its faction's other houses), one failing house failing only itself, and
a mapped house the index lists under another faction or not at all, and the
CPU-heavy parse + fold running off the event loop.
"""
from __future__ import annotations

import asyncio
import base64
import json
from collections.abc import Callable
from datetime import datetime, timezone

import httpx
import pytest

from app.services.wow.prices.auction_house import AuctionHouse
from app.services.wow.prices.blizzard_auction_client import BlizzardAuctionClient
from app.services.wow.prices.blizzard_price_fetch import fetch_with_client
from app.services.wow.prices.house_prices import HousePrices
from app.services.wow.prices.mapped_house import MappedHouse
from app.services.wow.prices.price_fetch_error import PriceFetchError

CLIENT_ID = "test-client-id"
CLIENT_SECRET = "test-client-secret"
SNAPSHOT = "Mon, 9 Nov 2026 17:16:22 GMT"
OLDER_SNAPSHOT = "Mon, 9 Nov 2026 16:16:22 GMT"
INDEX = {
    "auctions": [
        {"id": 110, "name": "Alliance Auction House"},
        {"id": 111, "name": "Alliance Auction House"},
        {"id": 113, "name": "Horde Auction House"},
        {"id": 116, "name": "Blackwater Auction House"},
        {"id": 999, "name": "Some New Auction House"},
    ]
}

Handler = Callable[[httpx.Request], httpx.Response]


def _json(body: object, status: int = 200, last_modified: str | None = SNAPSHOT) -> httpx.Response:
    headers = {"Last-Modified": last_modified} if last_modified else {}
    return httpx.Response(status, content=json.dumps(body).encode(), headers=headers)


def _commodity(item_id: int, unit_price: int, quantity: int) -> dict[str, object]:
    return {"id": 1, "item": {"id": item_id}, "quantity": quantity, "unit_price": unit_price}


def _blizzard(houses: dict[str, httpx.Response] | None = None, *, token: httpx.Response | None = None) -> Handler:
    """A fake Blizzard: the token, the index and each house path's answer (empty when not listed)."""
    answers = houses or {}

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.battle.net":
            return token or _json({"access_token": "tok", "token_type": "bearer", "expires_in": 86399})
        assert request.headers["Authorization"] == "Bearer tok"
        assert request.url.params["namespace"] == "dynamic-forever-us"
        path = request.url.path.removeprefix("/data/wow/ruleset/1/auctions/")
        if path == "":
            return _json(INDEX)
        return answers.get(path, _json({"auctions": []}))

    return handle


def _client(handler: Handler) -> BlizzardAuctionClient:
    return BlizzardAuctionClient(CLIENT_ID, CLIENT_SECRET, transport=httpx.MockTransport(handler))


async def test_the_token_is_asked_for_with_client_credentials() -> None:
    seen: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return _blizzard()(request)

    async with _client(handle):
        pass
    token = seen[0]
    assert token.method == "POST" and str(token.url) == "https://oauth.battle.net/token"
    assert token.content == b"grant_type=client_credentials"
    expected = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    assert token.headers["Authorization"] == f"Basic {expected}"


async def test_houses_take_their_faction_from_their_name_and_skip_unknown_names() -> None:
    async with _client(_blizzard()) as client:
        houses = await client.houses()
    assert houses == [
        AuctionHouse(110, "alliance"), AuctionHouse(111, "alliance"),
        AuctionHouse(113, "horde"), AuctionHouse(116, "neutral"),
    ]


async def test_a_house_answer_carries_its_snapshot_time() -> None:
    answers = {"110/commodities": _json({"auctions": [_commodity(2589, 24, 20)]})}
    async with _client(_blizzard(answers)) as client:
        answer = await client.house_auctions(110, commodities=True)
    assert answer.auctions == [_commodity(2589, 24, 20)]
    assert answer.snapshot_at == datetime(2026, 11, 9, 17, 16, 22, tzinfo=timezone.utc)


async def test_a_blizzard_api_error_keeps_its_status_and_code() -> None:
    answers = {"110": _json({"code": 404, "type": "BLZWEBAPI00000404", "detail": "Not Found"}, status=404)}
    async with _client(_blizzard(answers)) as client:
        with pytest.raises(PriceFetchError) as caught:
            await client.house_auctions(110, commodities=False)
    assert caught.value.status_code == 404
    assert caught.value.code == "BLZWEBAPI00000404"
    assert caught.value.summary() == "HTTP 404 BLZWEBAPI00000404: Not Found"


async def test_a_refused_token_keeps_the_oauth_error_and_never_the_secret() -> None:
    refused = _json({"error": "invalid_client", "error_description": "Bad client credentials"}, status=401)
    with pytest.raises(PriceFetchError) as caught:
        async with _client(_blizzard(token=refused)):
            pass
    assert (caught.value.status_code, caught.value.code) == (401, "invalid_client")
    assert caught.value.reason == "Bad client credentials"
    assert CLIENT_SECRET not in caught.value.summary() and CLIENT_ID not in caught.value.summary()


async def test_a_network_failure_is_a_fetch_error() -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    with pytest.raises(PriceFetchError) as caught:
        async with _client(handle):
            pass
    assert caught.value.status_code is None
    assert caught.value.reason == "request failed: ConnectError"


async def test_a_non_json_answer_is_a_fetch_error() -> None:
    answers = {"110": httpx.Response(200, content=b"<html>maintenance</html>")}
    async with _client(_blizzard(answers)) as client:
        with pytest.raises(PriceFetchError, match="not JSON"):
            await client.house_auctions(110, commodities=False)


def test_missing_credentials_fail_before_any_request() -> None:
    with pytest.raises(PriceFetchError, match="BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET are not set"):
        BlizzardAuctionClient("", CLIENT_SECRET)

# ---------------------------------------------------------------------------
# fetch_with_client — one set per mapped house, never pooled
# ---------------------------------------------------------------------------

PVP = [
    MappedHouse("pvp", "alliance", 110),
    MappedHouse("pvp", "horde", 113),
    MappedHouse("pvp", "neutral", 116),
]


async def test_each_house_is_its_own_market_and_other_houses_are_never_read() -> None:
    answers = {
        # The PvP Alliance house: commodities plus a non-stackable listing.
        "110/commodities": _json({"auctions": [_commodity(4611, 3980, 2)]}, last_modified=OLDER_SNAPSHOT),
        "110": _json({"auctions": [{"id": 5, "item": {"id": 4611}, "buyout": 8000, "quantity": 2}]}),
        # Another Alliance house, much cheaper — a different server's market.
        "111/commodities": _json({"auctions": [_commodity(4611, 3100, 50)]}),
        "113/commodities": _json({"auctions": [_commodity(4611, 6300, 1)]}),
    }
    asked: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        asked.append(request.url.path)
        return _blizzard(answers)(request)

    async with _client(handle) as client:
        results = await fetch_with_client(client, PVP)

    alliance = results[110]
    assert isinstance(alliance, HousePrices)
    [pearl] = alliance.prices
    # House 111's 31s pearls never reach house 110's price.
    assert (pearl.min_buyout, pearl.quantity, pearl.listing_count) == (3980, 4, 2)
    # The newer of the house's two answers.
    assert alliance.snapshot_at == datetime(2026, 11, 9, 17, 16, 22, tzinfo=timezone.utc)
    horde = results[113]
    assert isinstance(horde, HousePrices)
    assert [(p.item_id, p.min_buyout) for p in horde.prices] == [(4611, 6300)]
    neutral = results[116]
    assert isinstance(neutral, HousePrices) and neutral.prices == []
    assert set(results) == {110, 113, 116}
    assert not any("/111" in path for path in asked)


async def test_one_failing_house_fails_only_itself() -> None:
    answers = {
        "110": _json({"code": 503, "type": "BLZWEBAPI00000503", "detail": "Service Unavailable"}, status=503),
        "113/commodities": _json({"auctions": [_commodity(2589, 22, 10)]}),
    }
    async with _client(_blizzard(answers)) as client:
        results = await fetch_with_client(client, PVP)

    failed = results[110]
    assert isinstance(failed, PriceFetchError)
    assert (failed.status_code, failed.code) == (503, "BLZWEBAPI00000503")
    assert isinstance(results[113], HousePrices)
    assert isinstance(results[116], HousePrices)


async def test_a_mapped_house_the_index_lists_under_another_faction_or_not_at_all_is_refused() -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/auctions/"):
            return _json({"auctions": [
                {"id": 110, "name": "Alliance Auction House"},
                {"id": 113, "name": "Alliance Auction House"},
            ]})
        return _blizzard()(request)

    async with _client(handle) as client:
        results = await fetch_with_client(client, PVP)
    assert isinstance(results[110], HousePrices)
    renamed = results[113]
    assert isinstance(renamed, PriceFetchError) and "lists it as alliance" in renamed.reason
    missing = results[116]
    assert isinstance(missing, PriceFetchError) and "lists it as missing" in missing.reason


async def test_the_parse_and_the_fold_run_off_the_event_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    """A house answer can be 64MB of JSON: parsing and folding it on the loop
    would stall the scheduler's tick and heartbeat for seconds."""
    offloaded: list[str] = []
    real_to_thread = asyncio.to_thread

    async def _to_thread(func: Callable[..., object], /, *args: object, **kwargs: object) -> object:
        offloaded.append(func.__name__)
        return await real_to_thread(func, *args, **kwargs)

    monkeypatch.setattr(asyncio, "to_thread", _to_thread)
    answers = {"110/commodities": _json({"auctions": [_commodity(4611, 3980, 2)]})}
    async with _client(_blizzard(answers)) as client:
        results = await fetch_with_client(client, [MappedHouse("pvp", "alliance", 110)])

    assert isinstance(results[110], HousePrices)
    assert offloaded == ["_auction_rows", "_fold", "_auction_rows", "_fold", "prices"]
