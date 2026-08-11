"""Pure scoring helpers for Power to Choose offers.

No network, no DB — every function here is deterministic on its arguments so
the ranking rules can be tested against the real shapes the feed emits.
"""
from __future__ import annotations

import re
from decimal import Decimal

from app.core.power_to_choose_constants import (
    MIN_PROVIDER_RATING,
    REFERENCE_ANNUAL_KWH,
    TEASER_PRICE_RATIO,
    UNRATED_SENTINELS,
)

# Matches the dollar amount in a ``pricing_details`` string. The feed writes the
# fee 37 different ways across 174 Houston offers ("$150.00", "$100", "$20 /
# remaining month", "$20.00 per month left in term"), so the amount and the
# per-month qualifier are detected separately rather than by enumerating forms.
_FEE_AMOUNT_RE = re.compile(r"\$\s*([\d,]+(?:\.\d{1,2})?)")

# Any phrasing that makes the fee recur per month left in the term rather than
# being charged once.
_PER_MONTH_RE = re.compile(
    r"(?:per|/)\s*(?:remaining\s+)?month|month\s+(?:left|remaining)",
    re.IGNORECASE,
)


def parse_cancellation_fee_cents(pricing_details: str | None) -> tuple[int | None, bool]:
    """Pull the early-termination fee out of a feed ``pricing_details`` string.

    Returns ``(amount_cents, is_per_remaining_month)``. The amount is ``None``
    when no dollar figure is present at all — which is different from a stated
    ``$0.00`` fee, and the caller must not conflate the two: "no fee" is a
    selling point, "unknown fee" is a reason to read the EFL.
    """
    if not pricing_details:
        return None, False

    match = _FEE_AMOUNT_RE.search(pricing_details)
    if match is None:
        return None, False

    dollars = Decimal(match.group(1).replace(",", ""))
    cents = int((dollars * 100).to_integral_value())
    return cents, _PER_MONTH_RE.search(pricing_details) is not None


def is_teaser_priced(
    price_500: Decimal, price_1000: Decimal, price_2000: Decimal,
) -> bool:
    """True when the headline 1000 kWh price is propped up by a bill credit.

    A genuinely cheap plan is cheap across the whole usage curve. A plan that is
    dramatically cheaper at exactly 1000 kWh than at 500 or 2000 is pricing a
    credit that pays out only inside that band, and a household landing outside
    it pays the un-discounted rate. Ranking on the headline alone puts these at
    the top of the list, which is worse than useless.
    """
    edge = min(price_500, price_2000)
    if edge <= 0:
        return False
    return price_1000 < edge * Decimal(str(TEASER_PRICE_RATIO))


def normalize_rating(raw: object) -> int | None:
    """Turn a feed rating into a 1-5 score, or None when there is none on file.

    The feed writes -1 (occasionally 0) rather than omitting the field, and a
    caller that treats those as numbers would rank an unrated provider below a
    genuinely 1-star one.
    """
    if not isinstance(raw, int) or isinstance(raw, bool):
        return None
    if raw in UNRATED_SENTINELS:
        return None
    return raw if 1 <= raw <= 5 else None


def meets_rating_bar(rating: int | None) -> bool:
    """True when a provider is well-enough regarded to be worth recommending.

    Unrated fails. It is not the same as badly rated, but it is equally not a
    basis for telling someone to move their account.
    """
    return rating is not None and rating >= MIN_PROVIDER_RATING


def annual_saving_cents(
    current_price_1000: Decimal, offer_price_1000: Decimal,
) -> int:
    """Yearly difference in cents at the reference usage.

    Signed — a negative result means the offer is worse than what is held today,
    which the caller may still want to display rather than silently drop.
    """
    delta_cents_per_kwh = current_price_1000 - offer_price_1000
    return int((delta_cents_per_kwh * REFERENCE_ANNUAL_KWH).to_integral_value())


def switch_cost_cents(
    cancellation_fee_cents: int | None,
    *,
    is_per_remaining_month: bool,
    months_remaining: int | None,
) -> int | None:
    """What leaving the current plan early actually costs.

    ``None`` when the fee is unknown, or when a per-month fee has no remaining
    term to multiply by — an unknown cost must stay visibly unknown rather than
    defaulting to zero and making the switch look free.
    """
    if cancellation_fee_cents is None:
        return None
    if not is_per_remaining_month:
        return cancellation_fee_cents
    if months_remaining is None:
        return None
    return cancellation_fee_cents * max(months_remaining, 0)
