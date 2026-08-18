"""Response for the mortgage rate check."""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.mortgage.mortgage_refi_outlook import MortgageRefiOutlook


class MortgageRateWatchResponse(BaseModel):
    # One entry per active loan, checkable or not. A loan that drops out of the
    # list reads as one that was checked and found fine — the insurance version
    # shipped that way and the operator counted three policies as one.
    outlooks: list[MortgageRefiOutlook] = []

    # The two published averages, echoed so the page can state what it measured
    # against and when. A comparison whose benchmark is invisible is a number
    # the operator has to take on faith.
    survey_30_year_pct: Decimal | None = None
    survey_15_year_pct: Decimal | None = None
    survey_observed_on: _dt.date | None = None

    # Loans actually compared. "Nothing to do across your 3 loans" has to count
    # the ones that were looked at, or it overstates the all-clear.
    checked_mortgage_count: int = 0

    # Set when Freddie Mac's data could not be reached. Every loan still lists,
    # each carrying the same explanation, because a silent empty result would
    # read as "your rates are fine" when the truth is "nothing was checked".
    feed_unavailable_reason: str | None = None
