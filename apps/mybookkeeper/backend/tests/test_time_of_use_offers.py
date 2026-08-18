"""Tests for time-of-use plans: kept, flagged, and never priced against a flat rate.

These plans — free nights, free weekends, off-peak discounts — used to be
dropped at the feed boundary on the reasoning that a blended ¢/kWh is not
comparable to a flat one. The reasoning holds; the conclusion did not. It made a
whole product category invisible, including Champion's 5-star Free Weekends-24,
which is the best plan on the Houston board for a household that runs its load
at the weekend.

The invariant these tests defend is narrow and load-bearing: a time-of-use offer
reaches the operator, and it never carries a savings figure.

Fixtures are the literal shapes the feed returned for ZIP 77002 on 2026-08-18,
where 10 of 174 offers were time-of-use.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.core.power_to_choose_constants import MAX_TIME_OF_USE_OFFERS_PER_PROPERTY
from app.schemas.properties.utility_offer import UtilityOffer
from app.services.properties.power_to_choose_client import _to_offer
from app.services.properties.utility_offer_service import _rank, _rank_time_of_use

CURRENT_PRICE = Decimal("15.66")

# Champion Energy's Free Weekends-24, verbatim from the feed.
CHAMPION_ROW: dict[str, Any] = {
    "plan_id": 24545,
    "company_name": "CHAMPION ENERGY SERVICES LLC",
    "plan_name": "Free Weekends-24",
    "rate_type": "Fixed",
    "term_value": 24,
    "price_kwh500": 13.5,
    "price_kwh1000": 12.8,
    "price_kwh2000": 12.4,
    "prepaid": False,
    "timeofuse": True,
    "special_terms": (
        "Free power from 12 midnight Friday night to 11:59 PM Sunday night. "
        "No monthly fee or minimum usage requirement. Indexed Solar Buyback "
        "Included."
    ),
    "pricing_details": "Cancellation Fee: $150.00",
    "rating_total": 5,
    "jdp_rating": -1,
    "renewable_energy_id": 22,
    "fact_sheet": "https://example.test/efl.pdf",
    "go_to_plan": "https://example.test/enroll",
}


def _row(**overrides: Any) -> dict[str, Any]:
    return {**CHAMPION_ROW, **overrides}


def _offer(
    *,
    name: str,
    price: str,
    rating: int | None,
    term: int = 12,
    time_of_use: bool = False,
    plan_id: int = 1,
) -> UtilityOffer:
    value = Decimal(price)
    return UtilityOffer(
        external_plan_id=plan_id,
        provider_name=name,
        plan_name=f"{name} {term}",
        term_months=term,
        price_cents_per_kwh_at_500=value,
        price_cents_per_kwh_at_1000=value,
        price_cents_per_kwh_at_2000=value,
        provider_rating=rating,
        is_time_of_use=time_of_use,
    )


class TestFeedMapping:
    def test_a_time_of_use_row_is_kept_and_flagged(self) -> None:
        """The regression this whole change exists for — it used to return None."""
        offer = _to_offer(_row())

        assert offer is not None
        assert offer.is_time_of_use is True
        assert offer.provider_name == "CHAMPION ENERGY SERVICES LLC"
        assert offer.term_months == 24
        assert offer.provider_rating == 5

    def test_the_free_window_is_carried_through(self) -> None:
        """Without this text the card says nothing the operator can act on."""
        offer = _to_offer(_row())

        assert offer is not None
        assert offer.special_terms is not None
        assert "12 midnight Friday night" in offer.special_terms

    def test_a_flat_plan_carries_no_special_terms(self) -> None:
        """On a flat plan the field is marketing copy, not a term that matters."""
        offer = _to_offer(
            _row(
                timeofuse=False,
                special_terms="Promo Code PTC. Best rates in Texas!",
            ),
        )

        assert offer is not None
        assert offer.is_time_of_use is False
        assert offer.special_terms is None

    def test_prepaid_is_still_dropped(self) -> None:
        """A different product, bought under a deposit constraint, not on price."""
        assert _to_offer(_row(prepaid=True)) is None

    def test_a_variable_rate_plan_is_still_dropped(self) -> None:
        """The holdover product a lapsed plan already fell into."""
        assert _to_offer(_row(rate_type="Variable")) is None


class TestPricedRankingExcludesTimeOfUse:
    def test_a_time_of_use_offer_never_enters_the_priced_list(self) -> None:
        """Even when its blended rate is dramatically cheaper than the current one.

        This is the failure mode that keeping these offers introduces: a plan
        advertising 8.0¢ blended would top the ranking and be labelled with an
        annual saving the household has no reason to expect.
        """
        ranked, _ = _rank(
            [
                _offer(
                    name="Chariot Energy",
                    price="8.00",
                    rating=5,
                    time_of_use=True,
                    plan_id=1,
                ),
                _offer(name="Veteran Energy", price="10.50", rating=3, plan_id=2),
            ],
            current_price=CURRENT_PRICE,
            min_term_months=12,
        )

        assert [o.provider_name for o in ranked] == ["Veteran Energy"]

    def test_a_time_of_use_offer_is_not_counted_as_withheld(self) -> None:
        """It is not a hidden cheaper offer; it is listed elsewhere in full."""
        _, withheld = _rank(
            [_offer(name="Chariot Energy", price="8.00", rating=1, time_of_use=True)],
            current_price=CURRENT_PRICE,
            min_term_months=12,
        )

        assert withheld == 0


class TestTimeOfUseRanking:
    def test_only_time_of_use_offers_are_returned(self) -> None:
        listed, _ = _rank_time_of_use(
            [
                _offer(name="Veteran Energy", price="10.50", rating=3, plan_id=1),
                _offer(
                    name="Champion Energy",
                    price="12.80",
                    rating=5,
                    term=24,
                    time_of_use=True,
                    plan_id=2,
                ),
            ],
            min_term_months=12,
        )

        assert [o.provider_name for o in listed] == ["Champion Energy"]

    def test_a_dearer_blended_rate_is_still_listed(self) -> None:
        """Champion's 12.80¢ blended loses to a 10.50¢ flat rate on paper.

        A saving gate would drop it, and dropping it is the bug: the free
        weekend is worth what the household's weekend usage is worth, and
        nothing in the data says what that is.
        """
        listed, _ = _rank_time_of_use(
            [
                _offer(
                    name="Champion Energy",
                    price="12.80",
                    rating=5,
                    term=24,
                    time_of_use=True,
                ),
            ],
            min_term_months=12,
        )

        assert len(listed) == 1

    def test_no_saving_figure_is_ever_attached(self) -> None:
        """The load-bearing invariant. A number here would be a guess."""
        listed, _ = _rank_time_of_use(
            [
                _offer(
                    name="Champion Energy",
                    price="12.80",
                    rating=5,
                    term=24,
                    time_of_use=True,
                ),
            ],
            min_term_months=12,
        )

        assert listed[0].annual_saving_cents is None

    def test_poorly_rated_providers_are_withheld_and_counted(self) -> None:
        """Chariot's five 1-star Bright Nights plans are the real case."""
        listed, withheld = _rank_time_of_use(
            [
                _offer(
                    name="Chariot Energy",
                    price="10.10",
                    rating=1,
                    time_of_use=True,
                    plan_id=1,
                ),
                _offer(
                    name="Mystery REP",
                    price="10.00",
                    rating=None,
                    time_of_use=True,
                    plan_id=2,
                ),
                _offer(
                    name="Octopus Energy",
                    price="12.20",
                    rating=3,
                    time_of_use=True,
                    plan_id=3,
                ),
            ],
            min_term_months=12,
        )

        assert [o.provider_name for o in listed] == ["Octopus Energy"]
        assert withheld == 2

    def test_a_short_term_plan_is_dropped(self) -> None:
        """Just Energy's 3-month bundle re-exposes the same renewal cliff."""
        listed, withheld = _rank_time_of_use(
            [
                _offer(
                    name="Just Energy",
                    price="10.00",
                    rating=4,
                    term=3,
                    time_of_use=True,
                ),
            ],
            min_term_months=12,
        )

        assert listed == []
        # Dropped on term, not on rating — the withheld counter says "hidden
        # for being badly rated" and must not absorb a different reason.
        assert withheld == 0

    def test_cheapest_blended_rate_leads(self) -> None:
        """The rate paid outside the free window is the habit-independent part."""
        listed, _ = _rank_time_of_use(
            [
                _offer(
                    name="Champion Energy",
                    price="12.80",
                    rating=5,
                    term=24,
                    time_of_use=True,
                    plan_id=1,
                ),
                _offer(
                    name="Octopus Energy",
                    price="12.20",
                    rating=3,
                    time_of_use=True,
                    plan_id=2,
                ),
            ],
            min_term_months=12,
        )

        assert [o.provider_name for o in listed] == [
            "Octopus Energy",
            "Champion Energy",
        ]

    def test_the_list_is_capped(self) -> None:
        listed, _ = _rank_time_of_use(
            [
                _offer(
                    name=f"REP {index}",
                    price=f"1{index}.00",
                    rating=4,
                    time_of_use=True,
                    plan_id=index,
                )
                for index in range(MAX_TIME_OF_USE_OFFERS_PER_PROPERTY + 3)
            ],
            min_term_months=12,
        )

        assert len(listed) == MAX_TIME_OF_USE_OFFERS_PER_PROPERTY
