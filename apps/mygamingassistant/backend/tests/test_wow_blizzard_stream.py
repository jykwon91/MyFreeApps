"""The streaming reader for big Blizzard answers: rows as they arrive, the byte cap, malformed bodies.

Also the client-level seams that depend on it: a missing Last-Modified, rows that are not objects
and the cap, all through ``BlizzardAuctionClient.house_auctions``.
"""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone

import httpx
import pytest

from app.services.wow.blizzard.blizzard_stream import stream_array_rows
from app.services.wow.prices import blizzard_auction_client
from app.services.wow.prices.blizzard_auction_client import BlizzardAuctionClient
from app.services.wow.prices.price_fetch_error import PriceFetchError

URL = "https://example.test/auctions"


def _chunked(body: bytes, size: int) -> AsyncIterator[bytes]:
    async def chunks() -> AsyncIterator[bytes]:
        for start in range(0, len(body), size):
            yield body[start:start + size]

    return chunks()


async def _rows(response: httpx.Response, *, max_bytes: int = 10_000) -> list[dict[str, object]]:
    transport = httpx.MockTransport(lambda request: response)
    async with httpx.AsyncClient(transport=transport) as http:
        async with stream_array_rows(
            http, "GET", URL, array_key="auctions", error_cls=PriceFetchError, max_bytes=max_bytes,
        ) as stream:
            return [row async for row in stream.rows]


async def test_rows_arrive_whole_even_when_a_chunk_boundary_splits_them() -> None:
    body = json.dumps({"auctions": [{"id": n, "item": {"id": n}, "quantity": n} for n in range(1, 50)]}).encode()

    rows = await _rows(httpx.Response(200, content=_chunked(body, 7)))

    assert [row["id"] for row in rows] == list(range(1, 50))


async def test_a_row_that_is_not_an_object_is_skipped() -> None:
    body = json.dumps({"auctions": [{"id": 1}, 7, "x", None, [1], {"id": 2}]}).encode()

    assert await _rows(httpx.Response(200, content=body)) == [{"id": 1}, {"id": 2}]


async def test_an_answer_without_the_array_has_no_rows() -> None:
    assert await _rows(httpx.Response(200, content=b'{"_links": {}}')) == []


async def test_integers_stay_integers_so_prices_are_exact() -> None:
    [row] = await _rows(httpx.Response(200, content=b'{"auctions": [{"unit_price": 12345678901, "quantity": 3}]}'))

    assert row == {"unit_price": 12345678901, "quantity": 3}
    assert type(row["unit_price"]) is int


async def test_an_answer_over_the_cap_is_refused_on_the_bytes_streamed() -> None:
    body = json.dumps({"auctions": [{"id": n} for n in range(500)]}).encode()

    with pytest.raises(PriceFetchError, match="over the 200 byte cap") as caught:
        await _rows(httpx.Response(200, content=_chunked(body, 50)), max_bytes=200)

    assert caught.value.status_code == 200


async def test_an_answer_exactly_at_the_cap_is_read() -> None:
    body = b'{"auctions": [{"id": 1}]}'

    assert await _rows(httpx.Response(200, content=body), max_bytes=len(body)) == [{"id": 1}]


@pytest.mark.parametrize(
    "body",
    [b'{"auctions": [{"id": 1}, {"id": ', b'{"auctions": [{"id": 1},, ]}', b'{"auctions": nope}'],
    ids=["truncated", "malformed", "garbage"],
)
async def test_a_body_that_is_not_json_is_a_fetch_error(body: bytes) -> None:
    with pytest.raises(PriceFetchError, match="not JSON") as caught:
        await _rows(httpx.Response(200, content=_chunked(body, 5)))

    assert caught.value.status_code == 200


@pytest.mark.parametrize("body", [b'[{"id": 1}]', b'  "text"', b"<html>maintenance</html>"])
async def test_a_body_that_is_not_an_object_is_refused(body: bytes) -> None:
    with pytest.raises(PriceFetchError, match="not a JSON object"):
        await _rows(httpx.Response(200, content=body))


async def test_a_connection_lost_mid_answer_is_a_fetch_error() -> None:
    async def dies() -> AsyncIterator[bytes]:
        yield b'{"auctions": [{"id": 1},'
        raise httpx.ReadError("connection reset")

    with pytest.raises(PriceFetchError, match="request failed: ReadError"):
        await _rows(httpx.Response(200, content=dies()))


async def test_an_error_status_keeps_blizzards_code_and_never_reads_it_as_rows() -> None:
    body = {"code": 503, "type": "BLZWEBAPI00000503", "detail": "Service Unavailable"}

    with pytest.raises(PriceFetchError) as caught:
        await _rows(httpx.Response(503, json=body))

    assert (caught.value.status_code, caught.value.code) == (503, "BLZWEBAPI00000503")


# --- through the client ---------------------------------------------------------------------


def _client(response: httpx.Response) -> BlizzardAuctionClient:
    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.battle.net":
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 86399})
        return response

    return BlizzardAuctionClient("id", "secret", transport=httpx.MockTransport(handle))


async def test_an_answer_without_last_modified_has_no_snapshot_time() -> None:
    async with _client(httpx.Response(200, content=b'{"auctions": [{"id": 1}]}')) as client:
        async with client.house_auctions(110, commodities=False) as answer:
            assert [row async for row in answer.auctions] == [{"id": 1}]

    assert answer.snapshot_at is None


async def test_an_unreadable_last_modified_is_no_snapshot_time() -> None:
    response = httpx.Response(200, headers={"Last-Modified": "yesterday-ish"}, content=b'{"auctions": []}')
    async with _client(response) as client:
        async with client.house_auctions(110, commodities=True) as answer:
            pass

    assert answer.snapshot_at is None


async def test_the_clients_cap_is_blizzard_max_bytes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(blizzard_auction_client, "BLIZZARD_MAX_BYTES", 64)
    body = json.dumps({"auctions": [{"id": n, "item": {"id": n}} for n in range(100)]}).encode()
    headers = {"Last-Modified": "Mon, 9 Nov 2026 17:16:22 GMT"}

    async with _client(httpx.Response(200, headers=headers, content=_chunked(body, 32))) as client:
        with pytest.raises(PriceFetchError, match="byte cap"):
            async with client.house_auctions(110, commodities=True) as answer:
                [row async for row in answer.auctions]

    assert answer.snapshot_at == datetime(2026, 11, 9, 17, 16, 22, tzinfo=timezone.utc)

