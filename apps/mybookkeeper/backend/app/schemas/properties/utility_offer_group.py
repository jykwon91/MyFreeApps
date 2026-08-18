"""Offers for one property, measured against the plan it holds today."""
from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.properties.utility_offer import UtilityOffer


class UtilityOfferGroup(BaseModel):
    property_id: uuid.UUID
    property_name: str | None = None
    # Derived from the property's address, not stored — see
    # ``_address_zip.derive_zip_code``. None when the address carries no ZIP,
    # in which case ``offers`` is empty and ``unavailable_reason`` says why.
    zip_code: str | None = None
    current_provider_name: str | None = None
    current_price_cents_per_kwh_at_1000: Decimal | None = None
    # What it costs to leave the current plan early. None when unknown — an
    # unknown exit cost must never render as free.
    switch_cost_cents: int | None = None
    offers: list[UtilityOffer] = []
    # Cheaper offers held back for failing the provider-rating bar (or having no
    # rating on file). Reported rather than silently dropped so the list never
    # reads as "this is everything" when it is not.
    withheld_low_rated_count: int = 0
    # Plans that price by hour or day — free nights, free weekends, off-peak
    # discounts. Kept apart from ``offers`` and carrying no saving figure,
    # because whether one wins depends on *when* power is drawn and nothing in
    # the data says that. Listed so the operator can judge them, never ranked.
    time_of_use_offers: list[UtilityOffer] = []
    # Time-of-use plans held back on the same rating bar. Counted separately
    # from ``withheld_low_rated_count`` so neither number claims the other's
    # meaning — one is about cheaper offers, this one is not about price at all.
    withheld_low_rated_time_of_use_count: int = 0
    # Set when no ranking could be produced: no ZIP in the address, no current
    # electricity plan to compare against, or the feed was unreachable. The UI
    # shows this instead of an empty list, so a gap never reads as "no savings".
    unavailable_reason: str | None = None
