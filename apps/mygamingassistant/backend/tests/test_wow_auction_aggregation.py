"""Blizzard auction rows -> per-item prices: parsing, quantity math, troll robustness."""
from __future__ import annotations

import pytest

from app.services.wow.prices.auction_aggregator import AuctionAggregator, market_value
from app.services.wow.prices.auction_item_price import AuctionItemPrice
from app.services.wow.prices.auction_listing import AuctionListing
from app.services.wow.prices.auction_listing_parser import commodity_listing, item_listing

BLUE_PEARL = 4611
LINEN = 2589


def _commodity(item_id: int, unit_price: int, quantity: int) -> dict[str, object]:
    return {"id": 1, "item": {"id": item_id}, "quantity": quantity, "unit_price": unit_price, "time_left": "LONG"}


def _aggregate(*listings: AuctionListing) -> dict[int, AuctionItemPrice]:
    aggregator = AuctionAggregator()
    for listing in listings:
        aggregator.add(listing)
    return {price.item_id: price for price in aggregator.prices()}


# ---------------------------------------------------------------------------
# parsing
# ---------------------------------------------------------------------------

def test_a_commodity_row_reads_its_unit_price() -> None:
    assert commodity_listing(_commodity(LINEN, 24, 20)) == AuctionListing(item_id=LINEN, unit_price=24, quantity=20)


def test_a_non_stackable_row_divides_the_buyout_by_the_quantity() -> None:
    # Blizzard's buyout is for the whole listing: 5 pearls for 1g 65s = 33s each.
    raw = {"id": 9, "item": {"id": BLUE_PEARL}, "buyout": 16_500, "quantity": 5, "time_left": "SHORT"}
    assert item_listing(raw) == AuctionListing(item_id=BLUE_PEARL, unit_price=3_300, quantity=5)


def test_a_tiny_buyout_never_becomes_a_free_unit() -> None:
    raw = {"id": 9, "item": {"id": LINEN}, "buyout": 1, "quantity": 3}
    assert item_listing(raw) == AuctionListing(item_id=LINEN, unit_price=1, quantity=3)


@pytest.mark.parametrize(
    "raw",
    [
        {"id": 1, "item": {"id": LINEN}, "bid": 50, "quantity": 1},  # bid only: no buyout
        {"id": 1, "item": {"id": LINEN}, "buyout": 0, "quantity": 1},
        {"id": 1, "item": {"id": LINEN}, "buyout": 50, "quantity": 0},
        {"id": 1, "item": {}, "buyout": 50, "quantity": 1},
        {"id": 1, "item": "2589", "buyout": 50, "quantity": 1},
        {"id": 1, "item": {"id": True}, "buyout": 50, "quantity": 1},
        {"id": 1, "item": {"id": LINEN}, "buyout": "50", "quantity": 1},
    ],
)
def test_unusable_item_rows_are_skipped(raw: dict[str, object]) -> None:
    assert item_listing(raw) is None


def test_a_commodity_without_a_unit_price_is_skipped() -> None:
    assert commodity_listing({"id": 1, "item": {"id": LINEN}, "quantity": 5}) is None


# ---------------------------------------------------------------------------
# aggregation
# ---------------------------------------------------------------------------

def test_quantities_listings_and_cheapest_add_up_across_listings() -> None:
    prices = _aggregate(
        AuctionListing(LINEN, 24, 20),
        AuctionListing(LINEN, 22, 5),
        AuctionListing(LINEN, 30, 200),
        AuctionListing(BLUE_PEARL, 3_300, 1),
    )
    assert prices[LINEN] == AuctionItemPrice(
        # 10% of 225 units = 23rd cheapest unit: 5 at 22c, then the 24c stack.
        item_id=LINEN, market_value=24, min_buyout=22, quantity=225, listing_count=3,
    )
    assert prices[BLUE_PEARL] == AuctionItemPrice(
        item_id=BLUE_PEARL, market_value=3_300, min_buyout=3_300, quantity=1, listing_count=1,
    )


def test_prices_come_out_in_item_order() -> None:
    prices = AuctionAggregator()
    for item_id in (14047, LINEN, BLUE_PEARL):
        prices.add(AuctionListing(item_id, 10, 1))
    assert [p.item_id for p in prices.prices()] == [LINEN, BLUE_PEARL, 14047]


def test_one_cheap_troll_unit_does_not_move_the_market_value() -> None:
    prices = _aggregate(AuctionListing(BLUE_PEARL, 1, 1), *[AuctionListing(BLUE_PEARL, 3_300, 1)] * 50)
    assert prices[BLUE_PEARL].market_value == 3_300
    # The cheapest is still reported as what it is.
    assert prices[BLUE_PEARL].min_buyout == 1


def test_one_absurd_high_listing_does_not_move_the_market_value() -> None:
    prices = _aggregate(AuctionListing(LINEN, 9_999_999, 1_000), *[AuctionListing(LINEN, 25, 20)] * 100)
    assert prices[LINEN].market_value == 25


def test_the_market_value_is_weighted_by_units_not_listings() -> None:
    # Ten one-unit listings at 10c, one 200-stack at 40c: 90%+ of the units are at 40c.
    prices = _aggregate(*[AuctionListing(LINEN, 10, 1)] * 10, AuctionListing(LINEN, 40, 200))
    assert prices[LINEN].market_value == 40


def test_with_few_units_the_market_value_is_the_cheapest() -> None:
    assert market_value({500: 1, 900: 3}) == 500


def test_market_value_needs_a_unit() -> None:
    with pytest.raises(ValueError):
        market_value({})
