"""Find better electricity plans than the ones each property currently holds.

Orchestration only: loads the current plans and their properties, asks
``power_to_choose_client`` what is on offer at each ZIP, and applies the ranking
rules in ``_offer_ranking``. Nothing is persisted — an offer becomes a row only
when the operator signs up and records the new plan through the normal add flow.

Ranking order is deliberate and quality-first:

1. Drop anything the operator cannot sensibly switch to — wrong term, no saving.
2. **Gate on provider rating.** The cheapest honest offers in Houston are 1-star
   REPs, and a rock-bottom rate from a provider with a billing-dispute
   reputation is a false saving. Withheld offers are counted, never hidden.
3. Sink teaser-priced offers below honest ones.
4. Only then sort by price, breaking ties toward the better-rated provider.

Time-of-use plans are handled apart from all of that. A free-weekends plan is
worth what the household's weekend usage is worth, and the only consumption
figure available here is an annual reference total — it carries no information
about *when* power is drawn. So these are listed with their terms and no saving
figure at all, rather than either silently dropped (which hid well-rated plans
from the operator entirely) or ranked on a blended rate that nobody pays.
"""
from __future__ import annotations

import math
import uuid
from decimal import Decimal

from app.core.power_to_choose_constants import (
    DEFAULT_MIN_TERM_MONTHS,
    MAX_OFFERS_PER_PROPERTY,
    MAX_TIME_OF_USE_OFFERS_PER_PROPERTY,
    MIN_MEANINGFUL_SAVING_CENTS,
    REFERENCE_ANNUAL_KWH,
)
from app.core.utility_plan_constants import (
    RATE_TYPE_REGULATED,
    SERVICE_TYPE_ELECTRICITY,
)
from app.db.session import unit_of_work
from app.repositories.properties import property_repo, utility_plan_repo
from app.schemas.properties.utility_offer import UtilityOffer
from app.schemas.properties.utility_offer_group import UtilityOfferGroup
from app.schemas.properties.utility_offer_search_response import (
    UtilityOfferSearchResponse,
)
from app.services.properties._address_zip import derive_zip_code
from app.services.properties._offer_ranking import (
    annual_saving_cents,
    meets_rating_bar,
    switch_cost_cents,
)
from app.services.properties._utility_plan_helpers import (
    current_plan_ids,
    days_until_term_end,
)
from app.services.properties.power_to_choose_client import (
    OfferFeedUnavailableError,
    fetch_offers,
)

_NO_ZIP_REASON = (
    "Add a ZIP code to this property's address so we can look up what's "
    "available there."
)
_NO_PLAN_REASON = (
    "Record this property's current electricity plan first — there's nothing "
    "to measure an offer against yet."
)
_REGULATED_REASON = (
    "This plan is a regulated tariff, so there's no competing supplier to "
    "switch to."
)
_FEED_DOWN_REASON = (
    "Power to Choose isn't responding right now. Nothing is wrong with your "
    "plan — try again shortly."
)
_NO_BETTER_REASON = (
    "Nothing on the market beats this plan by enough to be worth switching."
)


def _months_remaining(term_end_date: object) -> int | None:
    """Whole months left on a term, rounded up. None when there is no end date."""
    days = days_until_term_end(term_end_date)  # type: ignore[arg-type]
    if days is None:
        return None
    return max(math.ceil(days / 30), 0)


def _rank(
    offers: list[UtilityOffer],
    *,
    current_price: Decimal,
    min_term_months: int,
) -> tuple[list[UtilityOffer], int]:
    """Ranked offers worth showing, plus how many were withheld on rating."""
    withheld = 0
    kept: list[UtilityOffer] = []

    for offer in offers:
        if offer.is_time_of_use:
            continue
        if offer.term_months < min_term_months:
            continue

        saving = current_price - offer.price_cents_per_kwh_at_1000
        if saving < Decimal(str(MIN_MEANINGFUL_SAVING_CENTS)):
            continue

        # Quality gate comes after the saving check on purpose: a low-rated
        # offer that is not even cheaper is not a withheld opportunity, and
        # counting it would inflate the "hidden" number into noise.
        if not meets_rating_bar(offer.provider_rating):
            withheld += 1
            continue

        kept.append(
            offer.model_copy(
                update={
                    "annual_saving_cents": annual_saving_cents(
                        current_price, offer.price_cents_per_kwh_at_1000,
                    ),
                },
            ),
        )

    kept.sort(
        key=lambda o: (
            o.is_teaser_priced,
            o.price_cents_per_kwh_at_1000,
            -(o.provider_rating or 0),
        ),
    )
    return kept[:MAX_OFFERS_PER_PROPERTY], withheld


def _rank_time_of_use(
    offers: list[UtilityOffer], *, min_term_months: int,
) -> tuple[list[UtilityOffer], int]:
    """Time-of-use offers worth reading, plus how many were withheld on rating.

    No saving gate, because there is no honest saving to compute: the blended
    disclosure price a time-of-use plan publishes assumes a usage shape, and
    measuring it against a flat rate would reward or punish the plan for an
    assumption the operator never made. Champion's 5-star free-weekends plan
    prices at 12.8¢ blended against a 10.5¢ flat rate and would fail a saving
    gate outright, while being the single best plan on the market for a
    household that runs its load on Saturdays.

    The rating bar still applies. A plan the operator cannot get a billing
    dispute resolved on is not worth reading about, whatever it charges at 2am.
    """
    withheld = 0
    kept: list[UtilityOffer] = []

    for offer in offers:
        if not offer.is_time_of_use:
            continue
        if offer.term_months < min_term_months:
            continue
        if not meets_rating_bar(offer.provider_rating):
            withheld += 1
            continue
        kept.append(offer)

    # Cheapest blended rate first is the least-bad available ordering: it is the
    # rate paid outside the free window, which is the part of the bill that does
    # not depend on the household's habits.
    kept.sort(
        key=lambda o: (o.price_cents_per_kwh_at_1000, -(o.provider_rating or 0)),
    )
    return kept[:MAX_TIME_OF_USE_OFFERS_PER_PROPERTY], withheld


async def find_better_plans(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    min_term_months: int = DEFAULT_MIN_TERM_MONTHS,
) -> UtilityOfferSearchResponse:
    """Rank live market offers against every property's current electricity plan."""
    async with unit_of_work() as db:
        plans = await utility_plan_repo.list_all_active_for_org(
            db, user_id=user_id, organization_id=organization_id,
        )
        properties = await property_repo.list_by_org(db, organization_id)

    addresses = {prop.id: prop.address for prop in properties}
    names = {prop.id: prop.name for prop in properties}
    current_ids = current_plan_ids(list(plans))

    current_electricity = [
        plan
        for plan in plans
        if plan.service_type == SERVICE_TYPE_ELECTRICITY and plan.id in current_ids
    ]

    groups: list[UtilityOfferGroup] = []
    for plan in current_electricity:
        group = UtilityOfferGroup(
            property_id=plan.property_id,
            property_name=names.get(plan.property_id),
            zip_code=derive_zip_code(addresses.get(plan.property_id)),
            current_provider_name=plan.provider_name,
            current_price_cents_per_kwh_at_1000=plan.avg_price_cents_per_kwh_at_1000,
            switch_cost_cents=switch_cost_cents(
                plan.early_termination_fee_cents,
                # A stored fee is the total the EFL states, not a monthly rate —
                # per-month fees are normalised when the plan is recorded.
                is_per_remaining_month=False,
                months_remaining=_months_remaining(plan.term_end_date),
            ),
        )

        if plan.rate_type == RATE_TYPE_REGULATED:
            group.unavailable_reason = _REGULATED_REASON
            groups.append(group)
            continue
        if group.zip_code is None:
            group.unavailable_reason = _NO_ZIP_REASON
            groups.append(group)
            continue
        if plan.avg_price_cents_per_kwh_at_1000 is None:
            group.unavailable_reason = _NO_PLAN_REASON
            groups.append(group)
            continue

        try:
            available = await fetch_offers(group.zip_code)
        except OfferFeedUnavailableError:
            group.unavailable_reason = _FEED_DOWN_REASON
            groups.append(group)
            continue

        ranked, withheld = _rank(
            available,
            current_price=plan.avg_price_cents_per_kwh_at_1000,
            min_term_months=min_term_months,
        )
        group.offers = ranked
        group.withheld_low_rated_count = withheld

        time_of_use, withheld_tou = _rank_time_of_use(
            available, min_term_months=min_term_months,
        )
        group.time_of_use_offers = time_of_use
        group.withheld_low_rated_time_of_use_count = withheld_tou

        # Still set when only time-of-use plans came back: the sentence is about
        # what beats this plan on price, and none of these claim to.
        if not ranked:
            group.unavailable_reason = _NO_BETTER_REASON
        groups.append(group)

    return UtilityOfferSearchResponse(
        groups=groups,
        reference_annual_kwh=REFERENCE_ANNUAL_KWH,
        has_any_offers=any(group.offers for group in groups),
    )
