"""Response for the dwelling-market rate watch."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.insurance.insurance_policy_rate_outlook import (
    InsurancePolicyRateOutlook,
)
from app.schemas.insurance.insurance_rate_filing import InsuranceRateFiling


class InsuranceMarketWatchResponse(BaseModel):
    # One entry per active policy, whether or not a filing was matched.
    outlooks: list[InsurancePolicyRateOutlook] = []
    # Recent dwelling-line filings across the whole Texas market, regardless of
    # whether the operator holds a policy with the carrier. This is the
    # shortlist to take to an agent: a DP-3 is agent-bound, so "who is holding
    # rates flat" is the actionable output.
    market_filings: list[InsuranceRateFiling] = []
    # True when any policy has an in-force filing landing before its renewal.
    has_any_increase: bool = False
    # Set when TDI could not be reached. The policies still list, each carrying
    # the same explanation, because a silent empty result would read as "no
    # increases filed" when the truth is "nothing was checked".
    feed_unavailable_reason: str | None = None
