"""WoW Forever auction-house prices — TSM CSV parsing and the TSM provider (no DB).

Covers:
  - a real (trimmed) TSM file parses to copper, with 0 avg sale price = unknown
  - a header-only file = no prices
  - missing / bad cells skip the row; a changed header is an error, never "empty"
  - the provider sends conditional-GET headers, maps 304 / 5xx / network errors
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.tsm_csv import parse_tsm_csv
from app.services.wow.prices.tsm_provider import TsmPriceProvider

FIXTURES = Path(__file__).parent / "fixtures" / "tsm"
US_CSV = (FIXTURES / "forever_us_items.csv").read_text(encoding="utf-8")
KR_CSV = (FIXTURES / "forever_kr_items.csv").read_text(encoding="utf-8")
HEADER = "itemId,name,marketValue,historical,avgSalePrice,saleRate,soldPerDay,updatedAt"


# ---------------------------------------------------------------------------
# parse_tsm_csv
# ---------------------------------------------------------------------------

def test_parses_real_rows_in_copper() -> None:
    prices = {p.item_id: p for p in parse_tsm_csv(US_CSV)}
    assert len(prices) == 6
    linen = prices[2589]
    assert linen.name == "Linen Cloth"
    assert linen.market_value == 28
    assert linen.historical == 28
    assert linen.avg_sale_price == 24
    assert linen.sale_rate == pytest.approx(0.957)
    assert linen.sold_per_day == pytest.approx(7130.129)
    assert linen.source_updated_at == datetime(2026, 11, 5, 14, 49, 31, tzinfo=timezone.utc)


def test_zero_avg_sale_price_means_unknown_not_free() -> None:
    gloves = {p.item_id: p for p in parse_tsm_csv(US_CSV)}[3286]
    assert gloves.avg_sale_price is None
    assert gloves.market_value == 350


def test_header_only_file_is_no_prices() -> None:
    assert parse_tsm_csv(KR_CSV) == []
    assert parse_tsm_csv(HEADER) == []


def test_byte_order_mark_is_ignored() -> None:
    assert len(parse_tsm_csv("﻿" + US_CSV)) == 6


def test_changed_header_is_an_error() -> None:
    with pytest.raises(PriceFetchError, match="header changed"):
        parse_tsm_csv("itemId,name,price\n2589,Linen Cloth,28\n")


def test_rows_without_id_value_or_time_are_skipped() -> None:
    text = "\n".join([
        HEADER,
        ",No Id,10,10,10,0.1,1,2026-11-05T14:49:31Z",
        "0,Zero Id,10,10,10,0.1,1,2026-11-05T14:49:31Z",
        "100,No Market,,10,10,0.1,1,2026-11-05T14:49:31Z",
        "101,Negative,-5,10,10,0.1,1,2026-11-05T14:49:31Z",
        "102,Not A Number,abc,10,10,0.1,1,2026-11-05T14:49:31Z",
        "103,No Time,10,10,10,0.1,1,",
        "104,Kept,12.6,,,,,2026-11-05T14:49:31",
    ])
    prices = parse_tsm_csv(text)
    assert [p.item_id for p in prices] == [104]
    kept = prices[0]
    assert kept.market_value == 13  # rounded copper
    assert kept.historical is None and kept.avg_sale_price is None
    assert kept.sale_rate is None and kept.sold_per_day is None
    assert kept.source_updated_at.tzinfo is not None  # no zone in the file = UTC


def test_repeated_item_keeps_its_last_row() -> None:
    text = "\n".join([
        HEADER,
        "2589,Linen Cloth,28,28,24,0.9,1,2026-11-05T14:49:31Z",
        "2589,Linen Cloth,31,28,24,0.9,1,2026-11-05T14:49:31Z",
    ])
    assert [p.market_value for p in parse_tsm_csv(text)] == [31]


# ---------------------------------------------------------------------------
# TsmPriceProvider
# ---------------------------------------------------------------------------

def _provider(handler) -> TsmPriceProvider:
    return TsmPriceProvider(transport=httpx.MockTransport(handler))


async def test_fetch_returns_prices_and_validators() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, text=US_CSV, headers={"ETag": '"abc"', "Last-Modified": "Thu, 05 Nov 2026 14:50:00 GMT"})

    result = await _provider(handler).fetch("us", etag=None, last_modified=None)
    assert not result.not_modified
    assert len(result.prices) == 6
    assert result.etag == '"abc"'
    assert result.last_modified == "Thu, 05 Nov 2026 14:50:00 GMT"
    assert seen[0].url.path == "/forever/us/region/items.csv"
    assert "If-None-Match" not in seen[0].headers
    assert seen[0].headers["User-Agent"].startswith("MyGamingAssistant/")


async def test_fetch_sends_conditional_headers_and_maps_304() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(304)

    result = await _provider(handler).fetch("eu", etag='"abc"', last_modified="Thu, 05 Nov 2026 14:50:00 GMT")
    assert result.not_modified
    assert result.prices == []
    assert seen[0].headers["If-None-Match"] == '"abc"'
    assert seen[0].headers["If-Modified-Since"] == "Thu, 05 Nov 2026 14:50:00 GMT"


async def test_fetch_server_error_carries_the_status() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="Service Unavailable")

    with pytest.raises(PriceFetchError) as caught:
        await _provider(handler).fetch("us", etag=None, last_modified=None)
    assert caught.value.status_code == 503
    assert caught.value.summary().startswith("HTTP 503")


async def test_fetch_network_error_is_a_fetch_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    with pytest.raises(PriceFetchError) as caught:
        await _provider(handler).fetch("us", etag=None, last_modified=None)
    assert caught.value.status_code is None
    assert "ConnectError" in caught.value.reason
