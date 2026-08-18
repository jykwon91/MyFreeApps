"""What the rate check concluded about one loan."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel


class MortgageRefiOutlook(BaseModel):
    """One loan, measured against the survey — or a reason it wasn't.

    Every loan the operator holds gets one of these. A loan that cannot be
    compared still gets a row carrying ``unavailable_reason``, because a loan
    that silently vanishes from the list reads as one that was checked and
    found fine.

    The money fields come in low/high pairs and that is not hedging. The
    comparable rate for a rental is a band (see ``pmms_rate_constants``), and
    closing costs genuinely range from 2% to 5% of the balance. Collapsing
    either to a point estimate would state a precision the inputs do not have.
    ``low``/``high`` always refer to the FIGURE, so ``monthly_saving_low_cents``
    is the smaller saving — the conservative case — not the one from the low
    rate.
    """

    mortgage_id: uuid.UUID
    property_id: uuid.UUID
    property_name: str
    lender: str | None
    rate_type: str

    current_rate_pct: Decimal | None
    current_balance_cents: int | None

    is_checkable: bool
    unavailable_reason: str | None
    verdict: str

    # Which weekly average this was measured against, and when it was measured.
    survey_rate_pct: Decimal | None = None
    survey_term_months: int | None = None
    survey_observed_on: _dt.date | None = None

    # The survey average plus the adjustment for how the property is used.
    comparable_rate_low_pct: Decimal | None = None
    comparable_rate_high_pct: Decimal | None = None

    # Payments left. The replacement loan is priced over exactly this many, so
    # the saving is not inflated by stretching the payoff out again.
    remaining_term_months: int | None = None

    current_payment_cents: int | None = None
    new_payment_low_cents: int | None = None
    new_payment_high_cents: int | None = None

    monthly_saving_low_cents: int | None = None
    monthly_saving_high_cents: int | None = None

    closing_cost_low_cents: int | None = None
    closing_cost_high_cents: int | None = None

    # Months for the lower payment to repay the closing costs. ``None`` at
    # either end means the payment does not fall in that case, which must not
    # render as a long wait.
    breakeven_low_months: int | None = None
    breakeven_high_months: int | None = None
