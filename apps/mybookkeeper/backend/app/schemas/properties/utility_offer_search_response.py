"""Response for the better-plan search across every property."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.properties.utility_offer_group import UtilityOfferGroup


class UtilityOfferSearchResponse(BaseModel):
    groups: list[UtilityOfferGroup] = []
    # Reference consumption the savings figures were computed at, so the client
    # can label them honestly rather than implying a bill-specific promise.
    reference_annual_kwh: int
    # True when at least one group came back with offers.
    has_any_offers: bool = False
