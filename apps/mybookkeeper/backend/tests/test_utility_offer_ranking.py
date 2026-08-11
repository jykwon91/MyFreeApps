"""Tests for how offers are ordered and which ones are withheld.

The fixtures mirror the real Houston 77021 board: the two cheapest honest offers
are 1-star providers, the cheapest headline overall is a bill-credit teaser, and
the best recommendable plan sits 0.20¢ above the ungated cheapest.
"""
from __future__ import annotations

from decimal import Decimal

from app.core.power_to_choose_constants import MAX_OFFERS_PER_PROPERTY
from app.schemas.properties.utility_offer import UtilityOffer
from app.services.properties.utility_offer_service import _rank

CURRENT_PRICE = Decimal("15.66")


def _offer(
    *,
    name: str,
    price: str,
    rating: int | None,
    term: int = 12,
    teaser: bool = False,
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
        is_teaser_priced=teaser,
    )


class TestRatingGate:
    def test_a_cheaper_one_star_offer_is_withheld(self) -> None:
        """True Power at 10.30¢ is the cheapest honest plan — and 1-star.

        The operator has said twice they do not want it. Veteran Energy at
        10.50¢ with 3 stars is the answer, 0.20¢ dearer.
        """
        ranked, withheld = _rank(
            [
                _offer(name="True Power", price="10.30", rating=1, plan_id=1),
                _offer(name="Budget Power", price="10.40", rating=1, plan_id=2),
                _offer(name="Veteran Energy", price="10.50", rating=3, plan_id=3),
            ],
            current_price=CURRENT_PRICE,
            min_term_months=12,
        )

        assert [o.provider_name for o in ranked] == ["Veteran Energy"]
        assert withheld == 2

    def test_an_unrated_provider_is_withheld_too(self) -> None:
        ranked, withheld = _rank(
            [
                _offer(name="Mystery REP", price="10.00", rating=None, plan_id=1),
                _offer(name="Octopus Energy", price="10.50", rating=3, plan_id=2),
            ],
            current_price=CURRENT_PRICE,
            min_term_months=12,
        )

        assert [o.provider_name for o in ranked] == ["Octopus Energy"]
        assert withheld == 1

    def test_a_low_rated_offer_that_is_not_cheaper_is_not_counted(self) -> None:
        """Withholding is about missed savings, not a census of bad providers."""
        _, withheld = _rank(
            [_offer(name="Dear And Bad", price="20.00", rating=1)],
            current_price=CURRENT_PRICE,
            min_term_months=12,
        )
        assert withheld == 0


class TestOrdering:
    def test_teasers_sink_below_honest_offers(self) -> None:
        """A teaser may be numerically cheapest and must still not lead."""
        ranked, _ = _rank(
            [
                _offer(
                    name="AP Gas", price="6.20", rating=3, teaser=True, plan_id=1,
                ),
                _offer(name="True Value", price="10.30", rating=3, plan_id=2),
            ],
            current_price=CURRENT_PRICE,
            min_term_months=12,
        )
        assert [o.provider_name for o in ranked] == ["True Value", "AP Gas"]

    def test_equal_prices_break_toward_the_better_rated_provider(self) -> None:
        ranked, _ = _rank(
            [
                _offer(name="Three Star", price="10.50", rating=3, plan_id=1),
                _offer(name="Five Star", price="10.50", rating=5, plan_id=2),
            ],
            current_price=CURRENT_PRICE,
            min_term_months=12,
        )
        assert [o.provider_name for o in ranked] == ["Five Star", "Three Star"]

    def test_the_list_is_capped(self) -> None:
        offers = [
            _offer(name=f"REP {i}", price="11.00", rating=4, plan_id=i)
            for i in range(MAX_OFFERS_PER_PROPERTY + 5)
        ]
        ranked, _ = _rank(
            offers, current_price=CURRENT_PRICE, min_term_months=12,
        )
        assert len(ranked) == MAX_OFFERS_PER_PROPERTY


class TestFiltering:
    def test_a_shorter_term_than_asked_for_is_dropped(self) -> None:
        ranked, _ = _rank(
            [_offer(name="Six Month", price="9.00", rating=5, term=6)],
            current_price=CURRENT_PRICE,
            min_term_months=12,
        )
        assert ranked == []

    def test_a_saving_too_small_to_act_on_is_dropped(self) -> None:
        """15.66 -> 15.00 is 0.66¢, inside the noise of a usage swing."""
        ranked, _ = _rank(
            [_offer(name="Barely Better", price="15.00", rating=5)],
            current_price=CURRENT_PRICE,
            min_term_months=12,
        )
        assert ranked == []

    def test_the_saving_is_attached_to_each_kept_offer(self) -> None:
        ranked, _ = _rank(
            [_offer(name="Veteran Energy", price="10.50", rating=3)],
            current_price=CURRENT_PRICE,
            min_term_months=12,
        )
        assert ranked[0].annual_saving_cents == 61920
