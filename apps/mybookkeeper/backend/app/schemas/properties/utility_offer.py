"""A single electricity offer available at a ZIP code, as ranked for the operator."""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel


class UtilityOffer(BaseModel):
    # Power to Choose's own plan id. Not a local row — nothing about an offer is
    # persisted until the operator actually signs up and records the new plan.
    external_plan_id: int
    provider_name: str
    plan_name: str
    term_months: int
    # All three published disclosure points, because the shape across them is
    # what separates a real price from a bill-credit teaser. The client shows
    # all three rather than making the operator trust a single number.
    price_cents_per_kwh_at_500: Decimal
    price_cents_per_kwh_at_1000: Decimal
    price_cents_per_kwh_at_2000: Decimal
    renewable_pct: int | None = None
    # Power to Choose customer rating, 1-5. None when the feed has none on file
    # — which the UI must render as "unrated", never as a zero-star score.
    provider_rating: int | None = None
    # J.D. Power residential satisfaction score, 1-5, where published. Only a
    # minority of REPs carry one, so it is a bonus signal and never a gate.
    jd_power_rating: int | None = None
    # None means the feed stated no dollar figure — distinct from a stated $0.
    cancellation_fee_cents: int | None = None
    cancellation_fee_is_per_remaining_month: bool = False
    # True when the 1000 kWh headline is far below this plan's own price at 500
    # and 2000 kWh. Ranked below honest plans and badged in the UI.
    is_teaser_priced: bool = False
    # Signed cents per year at the reference usage, against the plan currently
    # held for this property. Negative means the offer is worse.
    annual_saving_cents: int | None = None
    # The provider's Electricity Facts Label — the legally binding terms. Always
    # surfaced, because a ranking is a starting point and not a recommendation.
    fact_sheet_url: str | None = None
    enroll_url: str | None = None
