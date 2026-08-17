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
    # The market, split rather than pooled. A single ranked list left the
    # operator to sort twenty carriers by hand to find the two useful groups;
    # these are the two groups. Both cover the whole Texas dwelling line
    # regardless of who the operator is insured with, because a DP-3 is
    # agent-bound and the point is knowing which names to raise.
    #
    # Carriers whose next dwelling rate goes up — who not to move to.
    market_rising: list[InsuranceRateFiling] = []
    # Carriers holding flat or cutting — the shortlist worth an agent call.
    market_flat: list[InsuranceRateFiling] = []
    # True when any policy has an in-force filing landing before its renewal.
    has_any_increase: bool = False
    # Policies actually checked against the feed — excludes those on a form the
    # dwelling line does not cover. "No increases across your 2 policies" has to
    # count the ones that were looked at, or it overstates the all-clear.
    checked_policy_count: int = 0
    # Set when TDI could not be reached. The policies still list, each carrying
    # the same explanation, because a silent empty result would read as "no
    # increases filed" when the truth is "nothing was checked".
    feed_unavailable_reason: str | None = None
